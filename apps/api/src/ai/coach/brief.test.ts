import {
  accountExportSchema,
  addDays,
  aiCostsResponseSchema,
  authResponseSchema,
  coachBriefResponseSchema,
  coachThreadResponseSchema,
  coachThreadSchema,
  coachThreadsResponseSchema,
  coachTurnResponseSchema,
  localDay,
  type CoachBriefHalf,
} from '@diet-tracker/shared'
import { eq, sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { purgeExpiredData } from '../../account/retention.js'
import { db } from '../../db/client.js'
import { aiCalls, coachBriefs, coachMessages, coachThreads } from '../../db/schema/index.js'
import { env } from '../../env.js'
import { resetRateLimits } from '../../middleware/rate-limit.js'
import { ensureExerciseCatalogue } from '../../training/exercises-service.js'
import { coachModel } from './agent.js'
import {
  acceptableSentence,
  briefModel,
  draftBrief,
  getBrief,
  numbersIn,
  type BriefWriter,
} from './brief.js'
import { loadBriefingInputs } from './briefing.js'
import { finn, scripted, seedAll, send, signUp, tess, type Account } from './test-helpers.js'

/**
 * The daily brief (slice 11c) against real Postgres: the drafts for both halves from the
 * seeded data, the invitation on an empty day, the model's sentence accepted or refused,
 * the once-a-day cache, the chat it opens, the owner's cost view and the export.
 */

const TZ = 'Europe/London'
const today = () => localDay(new Date(), TZ)
/** A fixed local 13:00 today, so the "to go" meals are the same whenever the test runs. */
const atOne = () => new Date(`${today()}T13:00:00.000Z`)

let finnAccount: Account
let tessAccount: Account

/** A writer that answers with a fixed sentence and counts its calls. */
function writer(sentence: string): BriefWriter & { calls: number } {
  const fake = {
    calls: 0,
    async write() {
      fake.calls += 1
      return { sentence, model: 'fake-brief-model' }
    },
  }
  return fake
}

beforeEach(async () => {
  resetRateLimits()
  await db.execute(
    sql`truncate table coach_briefs, coach_messages, coach_threads, workouts, weekly_reviews, log_entries, daily_summaries, foods, ai_calls, weight_entries, target_versions, profiles, sessions, users cascade`,
  )
  await ensureExerciseCatalogue()
  finnAccount = await signUp(finn.email, finn.profile)
  tessAccount = await signUp(tess.email, tess.profile)
  await seedAll(finnAccount, finn.email)
  await seedAll(tessAccount, tess.email)
  env.OPENAI_API_KEY = 'test-only-key'
  env.AI_DAILY_CALL_CAP = 150
  env.OWNER_EMAIL = undefined
  briefModel.override = writer('unused')
  coachModel.override = scripted([{ text: 'Hello.' }])
})

afterEach(() => {
  briefModel.override = null
  coachModel.override = null
  env.OPENAI_API_KEY = ''
  env.OWNER_EMAIL = undefined
})

describe('the draft', () => {
  it("quotes Finn's energy and protein as the Today screen shows them, with the meals to go", async () => {
    const inputs = await loadBriefingInputs(finnAccount.id, finnAccount.profile, atOne())
    const draft = draftBrief(inputs, 'diet')
    expect(draft.empty).toBe(false)
    const energy = inputs.dayScore.scores.energy_kcal!
    const protein = inputs.dayScore.scores.protein_g!
    expect(draft.facts.join('\n')).toContain(
      `Energy: ${Math.round(energy.actual).toLocaleString('en-GB')} of ${Math.round(energy.target).toLocaleString('en-GB')} kcal so far`,
    )
    expect(draft.facts.join('\n')).toContain(
      `Protein: ${Math.round(protein.actual)} of ${Math.round(protein.target)} g so far`,
    )
    // The sentence leads with whichever of the two is furthest behind, and says what is left.
    const behind = (energy.ratio ?? 0) <= (protein.ratio ?? 0) ? energy : protein
    expect(draft.sentence).toMatch(/^(Energy|Protein) is [\d,]+ (kcal|g) short with /)
    expect(draft.sentence).toContain(
      `${Math.round(behind.target - behind.actual).toLocaleString('en-GB')} ${behind.key === 'energy_kcal' ? 'kcal' : 'g'} short`,
    )
    expect(draft.sentence).toContain('to go')
    // Every number in the sentence is one of the facts', so the model can be held to the same rule.
    expect(acceptableSentence(draft.sentence, draft.facts)).toBe(draft.sentence)
    expect(draft.sentence.length).toBeLessThanOrEqual(160)
  })

  it("names Finn's week and last session for the gym half", async () => {
    const inputs = await loadBriefingInputs(finnAccount.id, finnAccount.profile, atOne())
    const draft = draftBrief(inputs, 'training')
    expect(draft.empty).toBe(false)
    expect(draft.sentence).toMatch(
      /^3 of 6 sessions this week; last was .+ on \w{3}: .+ kg × \d+\.$/,
    )
    expect(draft.facts.join('\n')).toContain('This week: 3 of 6 planned sessions done.')
    expect(draft.facts.join('\n')).toMatch(/Week on week: Overhead press: 400 kg lifted/)
    expect(acceptableSentence(draft.sentence, draft.facts)).toBe(draft.sentence)
  })

  it('invites the first entry on an empty day instead of judging, for both halves', async () => {
    const fresh = await signUp('quiet@example.com', finn.profile)
    const inputs = await loadBriefingInputs(fresh.id, fresh.profile, atOne())
    const diet = draftBrief(inputs, 'diet')
    expect(diet.empty).toBe(true)
    expect(diet.sentence).toMatch(/^Nothing logged yet/)
    expect(diet.sentence).not.toMatch(/short|over|missed/)
    const gym = draftBrief(inputs, 'training')
    expect(gym.empty).toBe(true)
    expect(gym.sentence).toMatch(/^No sessions in the last two weeks\. Log one/)
  })

  it('accepts a sentence only when its numbers are in the facts and it fits a line', () => {
    const facts = [
      '- Protein: 110 of 150 g so far, short, 40 g left.',
      '- Energy: 1,900 of 2,500 kcal.',
    ]
    expect(acceptableSentence('Protein is 40 g short: 110 of 150 g.', facts)).toBe(
      'Protein is 40 g short: 110 of 150 g.',
    )
    expect(acceptableSentence('You have had 1,900 of 2,500 kcal.', facts)).toBe(
      'You have had 1,900 of 2,500 kcal.',
    )
    expect(acceptableSentence('Protein is 45 g short.', facts)).toBeNull()
    expect(acceptableSentence('   ', facts)).toBeNull()
    expect(acceptableSentence('x'.repeat(161), facts)).toBeNull()
    expect(numbersIn('1,900 kcal and 2.5 serves on 2026-11-02')).toEqual([
      '1900',
      '2.5',
      '2026',
      '11',
      '02',
    ])
  })
})

describe('getBrief', () => {
  it("stores the model's sentence once a day and answers from the cache after that", async () => {
    const inputs = await loadBriefingInputs(finnAccount.id, finnAccount.profile, atOne())
    const draft = draftBrief(inputs, 'diet')
    const polished = writer(draft.sentence.replace(' so far.', '.'))
    briefModel.override = polished
    const first = await getBrief(finnAccount.id, finnAccount.profile, 'diet', atOne())
    expect(first).toMatchObject({
      half: 'diet',
      day: today(),
      text: draft.sentence.replace(' so far.', '.'),
      model: 'fake-brief-model',
      empty: false,
    })
    expect(polished.calls).toBe(1)
    const rows = await db.select().from(coachBriefs).where(eq(coachBriefs.userId, finnAccount.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ half: 'diet', day: today(), text: first.text })

    const again = await getBrief(finnAccount.id, finnAccount.profile, 'diet', new Date())
    expect(again.text).toBe(first.text)
    expect(polished.calls).toBe(1)
  })

  it("falls back to the app's own sentence when the model adds a number, and stores nothing", async () => {
    const invented = writer('Protein is 999 g short with dinner to go.')
    briefModel.override = invented
    const brief = await getBrief(finnAccount.id, finnAccount.profile, 'diet', atOne())
    expect(invented.calls).toBe(1)
    expect(brief.model).toBeNull()
    expect(brief.text).toMatch(/^(Energy|Protein) is [\d,]+ (kcal|g) short with /)
    expect(await db.select().from(coachBriefs)).toHaveLength(0)
  })

  it('never asks the model on an empty day, without a key, or at the daily cap', async () => {
    const counting = writer('Anything.')
    briefModel.override = counting
    const fresh = await signUp('quiet@example.com', finn.profile)
    const empty = await getBrief(fresh.id, fresh.profile, 'diet', atOne())
    expect(empty).toMatchObject({ empty: true, model: null })
    expect(empty.text).toMatch(/^Nothing logged yet/)

    env.OPENAI_API_KEY = ''
    const noKey = await getBrief(finnAccount.id, finnAccount.profile, 'diet', atOne())
    expect(noKey.model).toBeNull()

    env.OPENAI_API_KEY = 'test-only-key'
    env.AI_DAILY_CALL_CAP = 1
    await db.insert(aiCalls).values({
      id: uuidv7(),
      userId: finnAccount.id,
      purpose: 'estimate',
      model: 'x',
      inputTokens: 1,
      outputTokens: 1,
      latencyMs: 1,
      ok: true,
      error: null,
      webSearchCalls: 0,
    })
    const capped = await getBrief(finnAccount.id, finnAccount.profile, 'diet', atOne())
    expect(capped.model).toBeNull()
    expect(counting.calls).toBe(0)
    expect(await db.select().from(coachBriefs)).toHaveLength(0)
  })
})

describe('/api/v1/coach/brief and the chat it opens', () => {
  async function brief(cookie: string, half: CoachBriefHalf) {
    const res = await send(cookie, 'POST', '/api/v1/coach/brief', { half })
    expect(res.status).toBe(200)
    return coachBriefResponseSchema.parse(await res.json()).brief
  }

  it('answers each half, and opening the brief starts a chat with it as the first assistant line', async () => {
    briefModel.override = writer('Protein is on track; keep going.')
    const diet = await brief(finnAccount.cookie, 'diet')
    expect(diet.half).toBe('diet')
    expect(diet.model).toBe('fake-brief-model')
    const gym = await brief(finnAccount.cookie, 'training')
    expect(gym.half).toBe('training')

    const opened = await send(finnAccount.cookie, 'POST', '/api/v1/coach/threads', {
      brief: 'diet',
    })
    expect(opened.status).toBe(201)
    const thread = coachThreadSchema.parse(((await opened.json()) as { thread: unknown }).thread)
    expect(thread.turns).toBe(0)
    const got = await send(finnAccount.cookie, 'GET', `/api/v1/coach/threads/${thread.id}`)
    const body = coachThreadResponseSchema.parse(await got.json())
    expect(body.messages).toHaveLength(1)
    expect(body.messages[0]).toMatchObject({ role: 'assistant', text: diet.text, cards: [] })

    // Tapping again reuses the unanswered chat; the list hides it until it is answered.
    const again = await send(finnAccount.cookie, 'POST', '/api/v1/coach/threads', {
      brief: 'diet',
    })
    expect(((await again.json()) as { thread: { id: string } }).thread.id).toBe(thread.id)
    const list = await send(finnAccount.cookie, 'GET', '/api/v1/coach/threads')
    expect(coachThreadsResponseSchema.parse(await list.json()).threads).toHaveLength(0)

    // A reply replays the brief to the model as what the assistant said.
    const fake = scripted([{ text: 'Chicken tonight.' }])
    coachModel.override = fake
    const reply = await send(
      finnAccount.cookie,
      'POST',
      `/api/v1/coach/threads/${thread.id}/messages?stream=false`,
      { text: 'What should I eat tonight?' },
    )
    expect(reply.status).toBe(200)
    const turn = coachTurnResponseSchema.parse(await reply.json())
    expect(turn.thread.turns).toBe(1)
    const input = fake.params[0]!.input as { role?: string; content?: unknown }[]
    expect(input).toContainEqual({ role: 'assistant', content: diet.text })
    const listed = await send(finnAccount.cookie, 'GET', '/api/v1/coach/threads')
    expect(coachThreadsResponseSchema.parse(await listed.json()).threads).toHaveLength(1)

    // A plain POST still opens an empty chat, and a bad half is rejected.
    const plain = await send(finnAccount.cookie, 'POST', '/api/v1/coach/threads')
    expect(plain.status).toBe(201)
    const bad = await send(finnAccount.cookie, 'POST', '/api/v1/coach/threads', { brief: 'x' })
    expect(bad.status).toBe(400)
  })

  it('exports the briefs with the account and purges them under retention', async () => {
    briefModel.override = writer('Protein is on track; keep going.')
    await brief(finnAccount.cookie, 'diet')
    const old = addDays(today(), -200)
    await db.insert(coachBriefs).values({
      id: uuidv7(),
      userId: finnAccount.id,
      half: 'training',
      day: old,
      text: 'An old line.',
      model: 'fake-brief-model',
      generatedAt: new Date(),
    })
    const exported = await send(finnAccount.cookie, 'GET', '/api/v1/account/export/json')
    const data = accountExportSchema.parse(await exported.json())
    expect(data.app.schema).toBe(6)
    expect(data.coachBriefs.map((b) => [b.day, b.half])).toEqual([
      [old, 'training'],
      [today(), 'diet'],
    ])
    const purged = await purgeExpiredData()
    expect(purged.coachBriefs).toBe(1)
    expect(await db.select().from(coachBriefs)).toHaveLength(1)
    // Deleting the account takes the brief with it.
    await db.execute(sql`delete from users where id = ${finnAccount.id}`)
    expect(await db.select().from(coachBriefs)).toHaveLength(0)
    expect(await db.select().from(coachThreads)).toHaveLength(0)
    expect(await db.select().from(coachMessages)).toHaveLength(0)
  })
})

describe('/api/v1/ai/costs (owner only)', () => {
  it('is 404 for everyone until OWNER_EMAIL names an account, then lists calls by person and purpose', async () => {
    const me = await send(finnAccount.cookie, 'GET', '/api/v1/me')
    expect(authResponseSchema.parse(await me.json()).user.owner).toBe(false)
    expect((await send(finnAccount.cookie, 'GET', '/api/v1/ai/costs')).status).toBe(404)

    env.OWNER_EMAIL = 'FINN@example.com'
    const meAgain = await send(finnAccount.cookie, 'GET', '/api/v1/me')
    expect(authResponseSchema.parse(await meAgain.json()).user.owner).toBe(true)
    expect((await send(tessAccount.cookie, 'GET', '/api/v1/ai/costs')).status).toBe(404)

    const row = (userId: string, purpose: 'coach' | 'estimate', ok: boolean, searches = 0) => ({
      id: uuidv7(),
      userId,
      purpose,
      model: 'x',
      inputTokens: 100,
      outputTokens: 10,
      latencyMs: 5,
      ok,
      error: ok ? null : 'boom',
      webSearchCalls: searches,
    })
    await db
      .insert(aiCalls)
      .values([
        row(finnAccount.id, 'coach', true),
        row(finnAccount.id, 'coach', false),
        row(finnAccount.id, 'estimate', true, 2),
        row(tessAccount.id, 'estimate', true),
        { ...row(tessAccount.id, 'estimate', true), createdAt: addDaysDate(-40) },
      ])
    const res = await send(finnAccount.cookie, 'GET', '/api/v1/ai/costs')
    expect(res.status).toBe(200)
    const costs = aiCostsResponseSchema.parse(await res.json())
    expect(costs.days).toBe(30)
    expect(costs.rows).toEqual([
      {
        userId: finnAccount.id,
        email: 'finn@example.com',
        purpose: 'coach',
        calls: 2,
        failed: 1,
        inputTokens: 200,
        outputTokens: 20,
        webSearchCalls: 0,
      },
      {
        userId: finnAccount.id,
        email: 'finn@example.com',
        purpose: 'estimate',
        calls: 1,
        failed: 0,
        inputTokens: 100,
        outputTokens: 10,
        webSearchCalls: 2,
      },
      {
        userId: tessAccount.id,
        email: 'tess@example.com',
        purpose: 'estimate',
        calls: 1,
        failed: 0,
        inputTokens: 100,
        outputTokens: 10,
        webSearchCalls: 0,
      },
    ])
  })
})

function addDaysDate(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}
