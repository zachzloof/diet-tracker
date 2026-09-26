import {
  computeTargets,
  currentStreak,
  evaluateDay,
  findGaps,
  localDay,
  summariseWeek,
  weeklyReviewSchema,
  type Profile,
  type ScoredDay,
  type WeekStatsResponse,
} from '@diet-tracker/shared'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { callStructured } from '../ai/openai.js'
import { WEEKLY_REVIEW_SYSTEM_PROMPT, buildWeeklyReviewUserMessage } from '../ai/weekly-review.js'
import { closeDb } from '../db/client.js'
import { SEED_USERS } from '../db/seed-data.js'
import { seedWeekTotals } from '../db/seed-weeks.js'
import { buildTargetInput } from '../profile/profile-service.js'

/**
 * `pnpm ai:smoke:week [--record]`: builds Finn's and Tess's seeded weeks in memory, asks the
 * live model for the weekly review and prints it for a human to check against the numbers.
 * `--record` writes Finn's answer to `src/ai/__fixtures__/weekly-review-finn.json`. Not in CI.
 */

const record = process.argv.includes('--record')

for (const seed of SEED_USERS) {
  const today = localDay(new Date(), seed.profile.timezone)
  const profile: Profile = {
    ...seed.profile,
    createdAt: `${today}T00:00:00.000Z`,
    updatedAt: `${today}T00:00:00.000Z`,
  }
  const targets = computeTargets(buildTargetInput(seed.profile, today))
  const days: ScoredDay[] = seedWeekTotals(seed.email, today).map(({ day, totals }) => ({
    day,
    score: evaluateDay(totals, targets),
  }))
  const summary = summariseWeek(days)
  const stats: WeekStatsResponse = {
    start: days[0]?.day ?? today,
    end: today,
    today,
    days,
    daysLogged: summary.daysLogged,
    daysMet: summary.daysMet,
    streak: currentStreak(days, today),
    gaps: findGaps(
      days.map((d) => d.score),
      profile,
    ),
  }
  const user = buildWeeklyReviewUserMessage(profile, stats, targets)

  console.log(
    `\n=== ${seed.email}: ${stats.daysMet} of ${stats.daysLogged} days met, streak ${stats.streak}`,
  )
  for (const gap of stats.gaps) console.log(`  gap [${gap.severity}] ${gap.title}: ${gap.evidence}`)

  const result = await callStructured({
    purpose: 'weekly_review',
    userId: null,
    schemaName: 'weekly_review',
    schema: weeklyReviewSchema,
    system: WEEKLY_REVIEW_SYSTEM_PROMPT,
    user,
    maxOutputTokens: 1500,
  })
  const words = [
    result.data.summary,
    ...result.data.wins,
    ...result.data.changes.flatMap((c) => [c.title, c.why, c.how]),
    result.data.encouragement,
  ]
    .join(' ')
    .split(/\s+/).length
  console.log(
    `--- ${result.model}, ${result.latencyMs} ms, ${result.inputTokens} in / ${result.outputTokens} out, ${words} words`,
  )
  console.log(`\n${result.data.summary}\n`)
  console.log('Wins:')
  for (const w of result.data.wins) console.log(`  - ${w}`)
  console.log('Changes:')
  for (const c of result.data.changes)
    console.log(`  - ${c.title}\n      why: ${c.why}\n      how: ${c.how}`)
  console.log(`\n${result.data.encouragement}`)

  if (record && seed.email.startsWith('finn')) {
    const file = fileURLToPath(
      new URL('../ai/__fixtures__/weekly-review-finn.json', import.meta.url),
    )
    writeFileSync(
      file,
      `${JSON.stringify({ input: { system: WEEKLY_REVIEW_SYSTEM_PROMPT, user }, response: result.data }, null, 2)}\n`,
    )
    console.log(`\nrecorded ${file}`)
  }
}

await closeDb()
