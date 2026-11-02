import {
  localDay,
  type CoachCard,
  type CoachCardKind,
  type CoachEvent,
  type Profile,
} from '@diet-tracker/shared'
import { eq, inArray } from 'drizzle-orm'
import { runTurn } from '../ai/coach/agent.js'
import { buildBriefing, loadBriefingInputs } from '../ai/coach/briefing.js'
import { toolByName, type ToolContext } from '../ai/coach/tools/index.js'
import { closeDb, db } from '../db/client.js'
import { aiCalls, users } from '../db/schema/index.js'
import { SEED_USERS } from '../db/seed-data.js'
import { getProfile } from '../profile/profile-service.js'

/**
 * `pnpm ai:smoke:coach [--only finn|tess] [--question N]`: asks the live model the eleven
 * canonical questions (ai-coach skill, `references/tools.md`) as the seeded Finn and Tess
 * against the local database, prints each answer with the tools it used, the cards it
 * drafted, tokens and latency, then checks that every number in the answer appears in the
 * briefing or a tool result, that no food conflicts with the person's allergies or
 * dislikes, and that the questions expecting a card got one of the right kind (5 to 7
 * and 11; question 5 may instead give a reason not to). Run `pnpm db:seed` first. Nothing
 * is stored: threads are not created and cards are not confirmed, only `ai_calls` rows
 * (question 6 spends one estimator call). Not in CI.
 */

const QUESTIONS = [
  'How am I doing this week?',
  'What should I eat tonight to hit my protein?',
  'Why is my fat target what it is?',
  'Am I getting stronger on squat?',
  "I'm 300 kcal short most days, should I change my target?",
  'Log 2 eggs and toast for breakfast',
  "Plan me a 45 minute upper body session like last week's",
  'Is my weight trending the right way?',
  'What am I lacking?',
  'What did I eat on Tuesday?',
  'Remember that my left knee is sore',
]

/** The card each question should draft; `optional` when a reasoned "no" is also right. */
const EXPECTED_CARDS: Record<number, { kind: CoachCardKind; optional: boolean }> = {
  5: { kind: 'target_change', optional: true },
  6: { kind: 'estimate', optional: false },
  7: { kind: 'workout', optional: false },
  11: { kind: 'note', optional: false },
}

const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const questionArg = args.includes('--question')
  ? Number(args[args.indexOf('--question') + 1])
  : null

interface Row {
  who: string
  n: number
  question: string
  tools: string
  words: number
  ms: number
  tokens: string
  cards: string
  unmatched: string
  conflicts: string
  ok: boolean
}

const rows: Row[] = []

function numbersIn(text: string): string[] {
  return [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0].replace(/,/g, ''))
}

/** One line per card for the console: what the person would see on it. */
function cardLine(card: CoachCard): string {
  switch (card.kind) {
    case 'estimate':
      return `${card.result.estimate.items.map((i) => `${i.name} ${Math.round(i.nutrients.energy_kcal)} kcal`).join(', ')} → ${card.result.meal} ${card.result.day}`
    case 'target_change':
      return `${card.label} ${card.before} → ${card.after} ${card.unit}${card.dependants.length ? `; ${card.dependants.map((d) => `${d.label} ${d.before} → ${d.after}`).join(', ')}` : ''}${card.warning ? `; warning: ${card.warning}` : ''}`
    case 'workout':
      return `${card.title}: ${card.exercises.map((e) => `${e.exerciseName} ×${e.sets.length}${e.exerciseId ? '' : ' (unmatched)'}`).join(', ')}`
    case 'meal':
      return `${card.name}: ${card.items.length} items, ${card.totals.energy_kcal} kcal`
    case 'note':
      return `"${card.text}"`
  }
}

function conflictsIn(answer: string, profile: Profile): string[] {
  const lower = answer.toLowerCase()
  const words = [...profile.allergies, ...profile.dislikes].map((w) => w.toLowerCase())
  if (profile.allergies.map((a) => a.toLowerCase()).includes('shellfish')) {
    words.push('prawn', 'shrimp', 'crab', 'lobster', 'mussel', 'oyster', 'scallop')
  }
  return words.filter((w) => new RegExp(`\\b${w}\\b`).test(lower))
}

for (const seed of SEED_USERS) {
  const who = seed.email.split('@')[0] ?? seed.email
  if (only && who !== only) continue
  const user = (await db.select().from(users).where(eq(users.email, seed.email)))[0]
  const profile = user ? await getProfile(user.id) : null
  if (!user || !profile) {
    console.log(`\n=== ${who}: not seeded (run pnpm db:seed)`)
    continue
  }
  const now = new Date()
  const ctx: ToolContext = {
    userId: user.id,
    profile,
    now,
    today: localDay(now, profile.timezone),
  }
  const briefing = buildBriefing(await loadBriefingInputs(user.id, profile, now))
  console.log(
    `\n=== ${who} (${profile.goal}, ${profile.dietPattern}; briefing ${briefing.length} chars)`,
  )

  for (const [index, question] of QUESTIONS.entries()) {
    const n = index + 1
    if (questionArg !== null && questionArg !== n) continue
    const statuses: string[] = []
    const emit = (event: CoachEvent) => {
      if (event.event === 'status') statuses.push(event.data.text)
    }
    const start = performance.now()
    const result = await runTurn({
      userId: user.id,
      profile,
      history: [],
      text: question,
      now,
      emit,
    })
    const ms = Math.round(performance.now() - start)
    const calls = result.aiCallIds.length
      ? await db.select().from(aiCalls).where(inArray(aiCalls.id, result.aiCallIds))
      : []
    const tokensIn = calls.reduce((sum, c) => sum + (c.inputTokens ?? 0), 0)
    const tokensOut = calls.reduce((sum, c) => sum + (c.outputTokens ?? 0), 0)

    // Re-run the tools with the recorded arguments so the number check sees what the model saw.
    let seen = briefing
    for (const entry of result.toolTrail) {
      const tool = toolByName(entry.name)
      if (!tool || !entry.ok) continue
      try {
        seen += `\n${JSON.stringify(await tool.run(ctx, tool.schema.parse(entry.arguments) as never))}`
      } catch {
        // The check falls back to the briefing alone for this tool.
      }
    }
    const cardKinds = result.cards.map((card) => card.kind)
    const expected = EXPECTED_CARDS[n]
    const cardOk =
      !expected ||
      cardKinds.includes(expected.kind) ||
      (expected.optional && cardKinds.length === 0)
    // Every number a card shows is one the model was told, so the trace covers them too.
    seen += `\n${JSON.stringify(result.cards)}`
    const seenNumbers = new Set(numbersIn(seen))
    const unmatched = [...new Set(numbersIn(result.text))].filter((num) => !seenNumbers.has(num))
    const conflicts = conflictsIn(result.text, profile)
    const words = result.text.split(/\s+/).filter(Boolean).length

    console.log(`\n--- ${n}. ${question}`)
    console.log(
      `    ${calls.length} round${calls.length === 1 ? '' : 's'}, ${ms} ms, ${tokensIn} in / ${tokensOut} out, ${words} words${result.error ? `, ERROR ${result.error}` : ''}`,
    )
    for (const trail of result.toolTrail) {
      console.log(
        `    tool ${trail.name} ${JSON.stringify(trail.arguments)} ${trail.ok ? 'ok' : 'failed'} ${trail.ms} ms`,
      )
    }
    for (const card of result.cards) console.log(`    card ${card.kind} ${cardLine(card)}`)
    if (!cardOk) {
      console.log(
        `    EXPECTED a ${expected?.kind} card, got ${cardKinds.length ? cardKinds.join(', ') : 'none'}`,
      )
    }
    console.log(`\n${result.text.replace(/^/gm, '    ')}`)
    if (unmatched.length)
      console.log(`\n    numbers not in the briefing or a tool result: ${unmatched.join(', ')}`)
    if (conflicts.length)
      console.log(`    CONFLICT with allergies or dislikes: ${conflicts.join(', ')}`)

    rows.push({
      who,
      n,
      question,
      tools: result.toolTrail.map((t) => t.name).join(', ') || 'none',
      words,
      ms,
      tokens: `${tokensIn}/${tokensOut}`,
      cards: cardKinds.join(', ') || (expected ? (cardOk ? 'none (reasoned)' : 'MISSING') : '-'),
      unmatched: unmatched.join(' ') || '-',
      conflicts: conflicts.join(' ') || '-',
      ok: result.error === null && cardOk,
    })
  }
}

console.log(
  '\n| Who | # | Question | Tools | Cards | Words | ms | Tokens in/out | Numbers not traced | Conflicts | OK |',
)
console.log('|---|---|---|---|---|---|---|---|---|---|---|')
for (const r of rows) {
  console.log(
    `| ${r.who} | ${r.n} | ${r.question} | ${r.tools} | ${r.cards} | ${r.words} | ${r.ms} | ${r.tokens} | ${r.unmatched} | ${r.conflicts} | ${r.ok ? 'yes' : 'no'} |`,
  )
}

await closeDb()
