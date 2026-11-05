import {
  ACCOUNT_EXPORT_SCHEMA_VERSION,
  AI_PRICES_AS_OF,
  RETENTION_DAYS,
  accountExportSchema,
  addDays,
  aiCostsResponseSchema,
  authResponseSchema,
  coachBriefResponseSchema,
  coachThreadResponseSchema,
  coachThreadSchema,
  coachThreadsResponseSchema,
  coachTurnResponseSchema,
  emptyFoodGroupServes,
  emptyNutrientVector,
  localDay,
  type CoachBriefHalf,
} from '@diet-tracker/shared'
import { sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { purgeExpiredData } from '../../account/retention.js'
import { db } from '../../db/client.js'
import { aiCalls, coachBriefs, coachMessages, coachThreads } from '../../db/schema/index.js'
import { env } from '../../env.js'
import { resetRateLimits } from '../../middleware/rate-limit.js'
import { ensureExerciseCatalogue } from '../../training/exercises-service.js'
import { coachModel } from './agent.js'
import { draftBrief, getBrief } from './brief.js'
import { loadBriefingInputs } from './briefing.js'
import { finn, scripted, seedAll, send, signUp, tess, type Account } from './test-helpers.js'

/**
 * The daily brief (slice 11c) against real Postgres: the lines for both halves from the
 * seeded data, the invitation on an empty day, the line moving with the log with no model
 * call and nothing stored, the chat it opens, the owner's cost view and the export.
 */

const TZ = 'Europe/London'
const today = () => localDay(new Date(), TZ)
/** A fixed local 13:00 today, so the "to go" meals are the same whenever the test runs. */
const atOne = () => new Date(`${today()}T13:00:00.000Z`)

let finnAccount: Account
let tessAccount: Account

/**
 * One manual entry of `kcal` for lunch today, through the API as the app logs it. It is
 * rich in protein, so energy stays the further behind of the two and leads the line.
 */
async function logFood(account: Account, kcal: number): Promise<void> {
  const res = await send(account.cookie, 'POST', '/api/v1/log/entries', {
    day: today(),
    meal: 'lunch',
    loggedAt: new Date().toISOString(),
    entries: [
      {
        name: 'Rice bowl',
        quantity: 1,
        unit: 'bowl',
        grams: 300,
        nutrients: { ...emptyNutrientVector(), energy_kcal: kcal, protein_g: 60 },
        foodGroups: emptyFoodGroupServes(),
        source: 'manual',
        foodId: null,
        aiCallId: null,
        assumptions: [],
        confidence: null,
      },
    ],
  })
  expect(res.status).toBe(201)
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
  coachModel.override = scripted([{ text: 'Hello.' }])
})

afterEach(() => {
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
    // The sentence leads with whichever of the two is furthest behind, and says what is left.
    const behind = (energy.ratio ?? 0) <= (protein.ratio ?? 0) ? energy : protein
    const unit = behind.key === 'energy_kcal' ? 'kcal' : 'g'
    const n = (value: number) => Math.round(value).toLocaleString('en-GB')
    expect(draft.sentence).toMatch(/^(Energy|Protein) is [\d,]+ (kcal|g) short with /)
    expect(draft.sentence).toContain(`${n(behind.target - behind.actual)} ${unit} short`)
    // The eaten and target numbers are the ones the Today tiles print.
    expect(draft.sentence).toContain(`${n(behind.actual)} of ${n(behind.target)} ${unit} so far.`)
    expect(draft.sentence).toContain('to go')
    expect(draft.sentence.length).toBeLessThanOrEqual(160)
  })

  it("names Finn's week and last session for the gym half", async () => {
    const inputs = await loadBriefingInputs(finnAccount.id, finnAccount.profile, atOne())
    const draft = draftBrief(inputs, 'training')
    expect(draft.empty).toBe(false)
    expect(draft.sentence).toMatch(
      /^3 of 6 sessions this week; last was .+ on \w{3}: .+ kg × \d+\.$/,
    )
    expect(draft.sentence.length).toBeLessThanOrEqual(160)
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

  it('does not take a plan for food eaten: a planned-only day still invites the first entry', async () => {
    const fresh = await signUp('planner@example.com', finn.profile)
    const res = await send(fresh.cookie, 'POST', '/api/v1/log/entries', {
      day: localDay(new Date(), TZ),
      meal: 'dinner',
      loggedAt: new Date().toISOString(),
      planned: true,
      entries: [
        {
          name: 'Chicken curry',
          quantity: 1,
          unit: 'bowl',
          grams: 400,
          nutrients: { ...emptyNutrientVector(), energy_kcal: 640 },
          foodGroups: emptyFoodGroupServes(),
          source: 'manual',
          foodId: null,
          aiCallId: null,
          assumptions: [],
          confidence: null,
        },
      ],
    })
    expect(res.status).toBe(201)
    const inputs = await loadBriefingInputs(fresh.id, fresh.profile, new Date())
    expect(draftBrief(inputs, 'diet').empty).toBe(true)
  })
})

describe('getBrief', () => {
  it('moves with the log: each call is built from the numbers as they are now', async () => {
    const fresh = await signUp('mover@example.com', finn.profile)
    const empty = await getBrief(fresh.id, fresh.profile, 'diet', atOne())
    expect(empty).toMatchObject({ half: 'diet', day: today(), empty: true, model: null })
    expect(empty.text).toMatch(/^Nothing logged yet/)

    const energyLeft = async () => {
      const inputs = await loadBriefingInputs(fresh.id, fresh.profile, atOne())
      const energy = inputs.dayScore.scores.energy_kcal!
      return Math.round(energy.target - energy.actual).toLocaleString('en-GB')
    }
    await logFood(fresh, 400)
    const first = await getBrief(fresh.id, fresh.profile, 'diet', atOne())
    expect(first).toMatchObject({ empty: false, model: null })
    expect(first.text).toContain(`Energy is ${await energyLeft()} kcal short`)

    // More food the same day: the line follows, where the cached one used to stand still.
    await logFood(fresh, 600)
    const second = await getBrief(fresh.id, fresh.profile, 'diet', atOne())
    expect(second.text).toContain(`Energy is ${await energyLeft()} kcal short`)
    expect(second.text).not.toBe(first.text)
  })

  it('never asks a model and stores nothing, even with a key and under the cap', async () => {
    const brief = await getBrief(finnAccount.id, finnAccount.profile, 'diet', atOne())
    expect(brief.model).toBeNull()
    expect(brief.text).toMatch(/^(Energy|Protein) is [\d,]+ (kcal|g) short with /)
    await getBrief(finnAccount.id, finnAccount.profile, 'training', atOne())
    expect(await db.select().from(coachBriefs)).toHaveLength(0)
    expect(await db.select().from(aiCalls)).toHaveLength(0)
  })

  it('ignores a line a model stored earlier in the day', async () => {
    await db.insert(coachBriefs).values({
      id: uuidv7(),
      userId: finnAccount.id,
      half: 'diet',
      day: today(),
      text: 'Energy is 9,999 kcal short with lunch and dinner to go.',
      model: 'old-brief-model',
      generatedAt: new Date(),
    })
    const brief = await getBrief(finnAccount.id, finnAccount.profile, 'diet', atOne())
    expect(brief.model).toBeNull()
    expect(brief.text).not.toContain('9,999')
  })
})

describe('/api/v1/coach/brief and the chat it opens', () => {
  async function brief(cookie: string, half: CoachBriefHalf) {
    const res = await send(cookie, 'POST', '/api/v1/coach/brief', { half })
    expect(res.status).toBe(200)
    return coachBriefResponseSchema.parse(await res.json()).brief
  }

  it('answers each half, and opening the brief starts a chat with it as the first assistant line', async () => {
    const diet = await brief(finnAccount.cookie, 'diet')
    expect(diet.half).toBe('diet')
    expect(diet.model).toBeNull()
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

  it('still exports the briefs a model once wrote and purges them under retention', async () => {
    await db.insert(coachBriefs).values({
      id: uuidv7(),
      userId: finnAccount.id,
      half: 'diet',
      day: today(),
      text: 'Protein is on track; keep going.',
      model: 'fake-brief-model',
      generatedAt: new Date(),
    })
    const old = addDays(today(), -(RETENTION_DAYS + 17))
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
    expect(data.app.schema).toBe(ACCOUNT_EXPORT_SCHEMA_VERSION)
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
  it('is 404 for everyone until OWNER_EMAIL names an account, then lists calls and their cost by person and purpose', async () => {
    const me = await send(finnAccount.cookie, 'GET', '/api/v1/me')
    expect(authResponseSchema.parse(await me.json()).user.owner).toBe(false)
    expect((await send(finnAccount.cookie, 'GET', '/api/v1/ai/costs')).status).toBe(404)

    env.OWNER_EMAIL = 'FINN@example.com'
    const meAgain = await send(finnAccount.cookie, 'GET', '/api/v1/me')
    expect(authResponseSchema.parse(await meAgain.json()).user.owner).toBe(true)
    expect((await send(tessAccount.cookie, 'GET', '/api/v1/ai/costs')).status).toBe(404)

    const row = (
      userId: string,
      purpose: 'coach' | 'estimate',
      model: string,
      extra: { ok?: boolean; searches?: number; cached?: number | null } = {},
    ) => ({
      id: uuidv7(),
      userId,
      purpose,
      model,
      inputTokens: 1_000_000,
      cachedInputTokens: extra.cached ?? null,
      outputTokens: 100_000,
      latencyMs: 5,
      ok: extra.ok ?? true,
      error: (extra.ok ?? true) ? null : 'boom',
      webSearchCalls: extra.searches ?? 0,
    })
    await db.insert(aiCalls).values([
      // Two coach rounds on a dated snapshot, 400k of each million read from the cache.
      row(finnAccount.id, 'coach', 'gpt-5.5-2026-04-23', { cached: 400_000 }),
      row(finnAccount.id, 'coach', 'gpt-5.5-2026-04-23', { cached: 400_000, ok: false }),
      // An estimate logged before cached tokens were recorded, with two searches.
      row(finnAccount.id, 'estimate', 'gpt-5.5', { searches: 2 }),
      // A model with no listed price: counted, never priced.
      row(tessAccount.id, 'estimate', 'some-unlisted-model'),
      { ...row(tessAccount.id, 'estimate', 'gpt-5.5'), createdAt: addDaysDate(-40) },
    ])
    const res = await send(finnAccount.cookie, 'GET', '/api/v1/ai/costs')
    expect(res.status).toBe(200)
    const costs = aiCostsResponseSchema.parse(await res.json())
    expect(costs.days).toBe(30)
    expect(costs.pricesAsOf).toBe(AI_PRICES_AS_OF)
    expect(costs.usdToGbp).toBe(env.USD_TO_GBP)
    expect(costs.rows).toEqual([
      {
        userId: finnAccount.id,
        email: 'finn@example.com',
        purpose: 'coach',
        calls: 2,
        failed: 1,
        inputTokens: 2_000_000,
        cachedInputTokens: 800_000,
        outputTokens: 200_000,
        webSearchCalls: 0,
        // 1.2M fresh at $5/M + 800k cached at $0.50/M; 200k out at $30/M.
        inputCostUsd: 6.4,
        outputCostUsd: 6,
        searchCostUsd: 0,
        unpricedCalls: 0,
      },
      {
        userId: finnAccount.id,
        email: 'finn@example.com',
        purpose: 'estimate',
        calls: 1,
        failed: 0,
        inputTokens: 1_000_000,
        cachedInputTokens: 0,
        outputTokens: 100_000,
        webSearchCalls: 2,
        inputCostUsd: 5,
        outputCostUsd: 3,
        searchCostUsd: 0.02,
        unpricedCalls: 0,
      },
      {
        userId: tessAccount.id,
        email: 'tess@example.com',
        purpose: 'estimate',
        calls: 1,
        failed: 0,
        inputTokens: 1_000_000,
        cachedInputTokens: 0,
        outputTokens: 100_000,
        webSearchCalls: 0,
        inputCostUsd: 0,
        outputCostUsd: 0,
        searchCostUsd: 0,
        unpricedCalls: 1,
      },
    ])
  })
})

function addDaysDate(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}
