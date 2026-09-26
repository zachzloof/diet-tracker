import {
  addDays,
  apiErrorSchema,
  localDay,
  monthStatsResponseSchema,
  waterEntryInput,
  weekStatsResponseSchema,
  weeklyReviewResponseSchema,
  type Gap,
  type ProfileInput,
  type StoredWeeklyReview,
} from '@diet-tracker/shared'
import { sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { SESSION_COOKIE } from '../auth/session-service.js'
import { db } from '../db/client.js'
import { weeklyReviews } from '../db/schema/index.js'
import { SEED_USERS } from '../db/seed-data.js'
import { seedWeek } from '../db/seed-weeks.js'
import { resetRateLimits } from '../middleware/rate-limit.js'

/**
 * The seed weeks are designed so every number below can be worked out by hand from the
 * meal vectors in `seed-weeks.ts` and the rules in nutrients.md sections 4 and 5. The
 * expected values were computed independently of the engine before the test was written.
 */

const app = createApp()
const TZ = 'Europe/London'

let cookie = ''
let userId = ''

function send(method: 'GET' | 'PUT' | 'POST', path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: {
      cookie,
      'x-forwarded-for': '203.0.113.9',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

async function register(email: string): Promise<{ cookie: string; id: string }> {
  const res = await app.request('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
    body: JSON.stringify({ email, password: 'finn-password' }),
  })
  const body = (await res.json()) as { user: { id: string } }
  const c =
    res.headers
      .getSetCookie()
      .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
      ?.split(';')[0] ?? ''
  return { cookie: c, id: body.user.id }
}

async function signInAs(email: string, profile: ProfileInput): Promise<void> {
  const registered = await register(email)
  cookie = registered.cookie
  userId = registered.id
  const saved = await send('PUT', '/api/v1/profile', profile)
  expect(saved.status).toBe(200)
}

const finn = SEED_USERS.find((u) => u.email === 'finn@example.com')!
const tess = SEED_USERS.find((u) => u.email === 'tess@example.com')!
const today = () => localDay(new Date(), TZ)

const rule = (gap: Gap) => `${gap.rule}${gap.key ? `:${gap.key}` : ''}`

beforeEach(async () => {
  resetRateLimits()
  await db.execute(
    sql`truncate table weekly_reviews, log_entries, daily_summaries, foods, ai_calls, weight_entries, target_versions, profiles, sessions, users cascade`,
  )
})

describe('GET /api/v1/stats/week', () => {
  it('needs a profile', async () => {
    const registered = await register('new@example.com')
    cookie = registered.cookie
    const res = await send('GET', '/api/v1/stats/week')
    expect(res.status).toBe(409)
    expect((await apiErrorSchema.parse(await res.json())).error.code).toBe('profile_required')
  })

  it('returns seven empty days, no streak and the "log more days" gap for a fresh account', async () => {
    await signInAs(finn.email, finn.profile)
    const res = await send('GET', '/api/v1/stats/week')
    expect(res.status).toBe(200)
    const body = weekStatsResponseSchema.parse(await res.json())
    expect(body.today).toBe(today())
    expect(body.end).toBe(today())
    expect(body.start).toBe(addDays(today(), -6))
    expect(body.days).toHaveLength(7)
    expect(body.days.every((d) => !d.score.logged)).toBe(true)
    expect(body.daysLogged).toBe(0)
    expect(body.daysMet).toBe(0)
    expect(body.streak).toBe(0)
    expect(body.gaps.map(rule)).toEqual(['not_enough_days'])
  })

  it('rejects a week in the future and a malformed day', async () => {
    await signInAs(finn.email, finn.profile)
    const future = await send('GET', `/api/v1/stats/week?end=${addDays(today(), 1)}`)
    expect(future.status).toBe(400)
    const bad = await send('GET', '/api/v1/stats/week?end=yesterday')
    expect(bad.status).toBe(400)
  })

  it("matches the hand-computed days met, streak and gaps for Finn's seeded week", async () => {
    await signInAs(finn.email, finn.profile)
    expect(await seedWeek(userId, finn.email, TZ)).toBe(25)
    expect(await seedWeek(userId, finn.email, TZ)).toBe(0) // idempotent

    const body = weekStatsResponseSchema.parse(
      await (await send('GET', '/api/v1/stats/week')).json(),
    )
    // Day by day (see the table in seed-weeks.ts): missed, missed, met, met, met, met, unlogged.
    expect(
      body.days.map((d) => (d.score.logged ? (d.score.dayMet ? 'met' : 'missed') : 'unlogged')),
    ).toEqual(['missed', 'missed', 'met', 'met', 'met', 'met', 'unlogged'])
    expect(body.daysLogged).toBe(6)
    expect(body.daysMet).toBe(4)
    expect(body.streak).toBe(4)

    const [d6, d5, , d3, , d1, d0] = body.days
    // -6: 700 + 1500 + 370 = 2570 kcal (79%, short); protein 45 + 60 + 3 = 108 (72%, short);
    // sodium 250 + 3400 + 30 = 3680 (160%, over); alcohol 4 drinks (over).
    expect(d6?.score.scores.energy_kcal).toMatchObject({
      actual: 2570,
      target: 3250,
      status: 'short',
    })
    expect(d6?.score.scores.protein_g).toMatchObject({ actual: 108, status: 'short' })
    expect(d6?.score.scores.sodium_mg).toMatchObject({ actual: 3680, status: 'over' })
    expect(d6?.score.scores.alcohol_std_drinks).toMatchObject({ actual: 4, status: 'over' })
    // -5: 850 + 350 + 1500 = 2700 (83%, close); protein 150 (met); sodium 700 + 100 + 3400 = 4200 (over).
    expect(d5?.score.scores.energy_kcal).toMatchObject({ actual: 2700, status: 'close' })
    expect(d5?.score.scores.protein_g).toMatchObject({ actual: 150, status: 'met' })
    expect(d5?.score.scores.sodium_mg).toMatchObject({ actual: 4200, status: 'over' })
    // -3: 700 + 850 + 950 + 600 = 3100 (95%, met); sodium 250 + 700 + 900 + 450 = 2300 exactly (met).
    expect(d3?.score.scores.energy_kcal).toMatchObject({ actual: 3100, status: 'met' })
    expect(d3?.score.scores.sodium_mg).toMatchObject({ actual: 2300, status: 'met' })
    // -1: 700 + 350 + 950 + 600 = 2600, exactly 80% (close, not short).
    expect(d1?.score.scores.energy_kcal).toMatchObject({ actual: 2600, status: 'close' })
    // Today: one breakfast of 700 kcal (22%) with one entry is unlogged.
    expect(d0?.score).toMatchObject({ logged: false, entryCount: 1 })
    expect(d0?.score.scores.energy_kcal?.actual).toBe(700)
    // Water quick-adds add to totals without counting as entries: -4 has 4 meals + 1000 ml.
    expect(body.days[2]?.score.entryCount).toBe(4)
    expect(body.days[2]?.score.scores.water_ml?.actual).toBe(2400)

    // Gaps, ranked: severity, then distance from target, then key.
    expect(body.gaps.map(rule)).toEqual([
      'food_group_short:vegetables', // 4 days under 60%; average 2.5 of 6 (42%)
      'fibre_short:fiber_g', // 5 days under 75%; average 25.5 of 45 (57%)
      'food_group_short:fruit', // 4 days under 60%; average 1.33 of 2 (67%)
      'micro_short:vitamin_d_ug', // 6 days under 70%; average 4.08 of 15 (27%)
      'micro_short:vitamin_a_ug', // 6 days under 70%; average 335 of 900 (37%)
      'water_short:water_ml', // 4 days under 70%; average 1692 of 3250 (52%)
    ])
    const [vegetables, fibre, fruit, vitaminD, vitaminA, water] = body.gaps
    expect(vegetables).toMatchObject({ severity: 'medium', daysAffected: 4, daysLogged: 6 })
    expect(vegetables?.averageRatio).toBeCloseTo(2.5 / 6, 6)
    expect(vegetables?.evidence).toBe(
      'Vegetables were under 60% of target on 4 of 6 logged days (average 2.5 of 6 serves).',
    )
    expect(fibre).toMatchObject({ severity: 'medium', daysAffected: 5 })
    expect(fibre?.averageRatio).toBeCloseTo(25.5 / 45, 6)
    expect(fibre?.evidence).toBe(
      'Fibre was under 75% of target on 5 of 6 logged days (average 25.5 of 45 g).',
    )
    expect(fruit).toMatchObject({ severity: 'medium', daysAffected: 4 })
    expect(fruit?.averageRatio).toBeCloseTo(8 / 6 / 2, 6)
    expect(vitaminD).toMatchObject({ severity: 'low', daysAffected: 6 })
    expect(vitaminD?.averageRatio).toBeCloseTo(24.5 / 6 / 15, 6)
    expect(vitaminA).toMatchObject({ severity: 'low', daysAffected: 6 })
    expect(vitaminA?.averageRatio).toBeCloseTo(2010 / 6 / 900, 6)
    expect(water).toMatchObject({ severity: 'low', daysAffected: 4 })
    expect(water?.averageRatio).toBeCloseTo(10150 / 6 / 3250, 6)
    // Finn dislikes liver, so the vitamin A suggestions never mention it.
    expect(vitaminA?.suggestions.join(' ')).not.toMatch(/liver/i)
    expect(vitaminA?.suggestions).toHaveLength(3)
  })

  it("matches the hand-computed days met, streak and gaps for Tess's seeded week", async () => {
    await signInAs(tess.email, tess.profile)
    expect(await seedWeek(userId, tess.email, TZ)).toBe(27)

    const body = weekStatsResponseSchema.parse(
      await (await send('GET', '/api/v1/stats/week')).json(),
    )
    expect(
      body.days.map((d) => (d.score.logged ? (d.score.dayMet ? 'met' : 'missed') : 'unlogged')),
    ).toEqual(['missed', 'met', 'missed', 'missed', 'met', 'met', 'unlogged'])
    expect(body.daysLogged).toBe(6)
    expect(body.daysMet).toBe(3)
    expect(body.streak).toBe(2)

    const [d6, , d4, d3] = body.days
    // -6: 400 + 500 + 650 + 450 = 2000 kcal (127%, over); protein 85 (85%, close); added sugar 49 of 39 (over).
    expect(d6?.score.scores.energy_kcal).toMatchObject({
      actual: 2000,
      target: 1570,
      status: 'over',
    })
    expect(d6?.score.scores.protein_g).toMatchObject({ actual: 85, status: 'close' })
    expect(d6?.score.scores.added_sugar_g).toMatchObject({ actual: 49, status: 'over' })
    // -4: 1750 kcal is 111%, just outside the met band (close); protein 56 (short).
    expect(d4?.score.scores.energy_kcal).toMatchObject({ actual: 1750, status: 'close' })
    expect(d4?.score.scores.protein_g).toMatchObject({ actual: 56, status: 'short' })
    // -3: saturated fat 2 + 3 + 12 + 0.2 = 17.2 of 17 (101%, close, not over).
    expect(d3?.score.scores.saturated_fat_g?.actual).toBeCloseTo(17.2, 6)
    expect(d3?.score.scores.saturated_fat_g?.status).toBe('close')

    expect(body.gaps.map(rule)).toEqual([
      'protein_short:protein_g', // 3 days short or close; average 82.8 of 100 (83%)
      'food_group_short:fruit', // 4 days under 60%; average 1.33 of 2 (67%)
      'limit_over:added_sugar_g', // 3 days over; averaging 123% of the limit on those days
      'micro_short:iron_mg', // 6 days under 70%; average 7.75 of 18 (43%)
      'micro_short:folate_ug', // 6 days under 70%; average 202 of 400 (51%)
      'micro_short:vitamin_a_ug', // 6 days under 70%; average 383 of 700 (55%)
      'water_short:water_ml', // 4 days under 70%; average 1384 of 2250 (62%)
    ])
    const [protein, fruit, addedSugar, iron, folate, vitaminA, water] = body.gaps
    expect(protein).toMatchObject({ severity: 'high', daysAffected: 3, direction: 'under' })
    expect(protein?.averageRatio).toBeCloseTo(497 / 6 / 100, 6)
    expect(protein?.evidence).toBe(
      'Protein was short or close on 3 of 6 logged days (average 83% of target).',
    )
    expect(fruit?.averageRatio).toBeCloseTo(8 / 6 / 2, 6)
    expect(addedSugar).toMatchObject({ severity: 'medium', daysAffected: 3, direction: 'over' })
    expect(addedSugar?.averageRatio).toBeCloseTo((49 / 39 + 48 / 39 + 47 / 39) / 3, 6)
    expect(addedSugar?.evidence).toBe(
      'Added sugar was over the limit on 3 of 6 logged days, averaging 123% of the limit on those days.',
    )
    expect(iron?.averageRatio).toBeCloseTo(46.5 / 6 / 18, 6)
    expect(folate?.averageRatio).toBeCloseTo(1214 / 6 / 400, 6)
    expect(vitaminA?.averageRatio).toBeCloseTo(2300 / 6 / 700, 6)
    expect(water?.averageRatio).toBeCloseTo(8306 / 6 / 2250, 6)
    // Tess is allergic to shellfish: no oysters in any suggestion.
    expect(body.gaps.flatMap((g) => g.suggestions).join(' ')).not.toMatch(/oyster|prawn/i)
  })

  it('scores each day against the targets in force that day', async () => {
    await signInAs(finn.email, finn.profile)
    await seedWeek(userId, finn.email, TZ)
    // A heavier Finn today: a new version effective today with a higher energy target.
    const saved = await send('PUT', '/api/v1/profile', { ...finn.profile, weightKg: 78 })
    expect(saved.status).toBe(200)
    const body = weekStatsResponseSchema.parse(
      await (await send('GET', '/api/v1/stats/week')).json(),
    )
    const yesterday = body.days[5]!
    const now = body.days[6]!
    expect(yesterday.score.scores.energy_kcal?.target).toBe(3250)
    expect(now.score.scores.energy_kcal?.target).toBeGreaterThan(3250)
    // The past days did not change their verdicts.
    expect(body.daysMet).toBe(4)
  })
})

describe('GET /api/v1/stats/month', () => {
  it('lists day-met dots for the days that have a summary row', async () => {
    await signInAs(tess.email, tess.profile)
    await seedWeek(userId, tess.email, TZ)
    const res = await send('GET', '/api/v1/stats/month')
    expect(res.status).toBe(200)
    const body = monthStatsResponseSchema.parse(await res.json())
    expect(body.today).toBe(today())
    expect(body.month).toBe(today().slice(0, 7))
    // Only the seeded days that fall inside this month appear; each has a dot state.
    const seeded = Array.from({ length: 7 }, (_, i) => addDays(today(), i - 6)).filter((day) =>
      day.startsWith(body.month),
    )
    expect(body.days.map((d) => d.day)).toEqual(seeded)
    const byDay = new Map(body.days.map((d) => [d.day, d]))
    expect(byDay.get(addDays(today(), -1))).toMatchObject({ logged: true, dayMet: true })
    expect(byDay.get(today())).toMatchObject({ logged: false, dayMet: false })

    const explicit = await send('GET', `/api/v1/stats/month?month=${body.month}`)
    expect(explicit.status).toBe(200)
    const bad = await send('GET', '/api/v1/stats/month?month=2026-9')
    expect(bad.status).toBe(400)
    const empty = monthStatsResponseSchema.parse(
      await (await send('GET', '/api/v1/stats/month?month=2020-01')).json(),
    )
    expect(empty.days).toEqual([])
  })
})

describe('POST /api/v1/ai/weekly-review', () => {
  it('does not call the model for a week with too few logged days', async () => {
    await signInAs(finn.email, finn.profile)
    const res = await send('POST', '/api/v1/ai/weekly-review')
    expect(res.status).toBe(200)
    const body = weeklyReviewResponseSchema.parse(await res.json())
    expect(body.review).toBeNull()
    expect(body.daysLogged).toBe(0)
    expect(body.minimumDays).toBe(2)
  })

  it('answers ai_unavailable without a key, and serves a cached review generated today', async () => {
    await signInAs(finn.email, finn.profile)
    await seedWeek(userId, finn.email, TZ)
    const missing = await send('POST', '/api/v1/ai/weekly-review')
    expect(missing.status).toBe(503)
    expect(apiErrorSchema.parse(await missing.json()).error.code).toBe('ai_unavailable')

    const review: StoredWeeklyReview = {
      summary: 'Four of six logged days met.',
      wins: ['A four-day streak.'],
      changes: [
        { title: 'More vegetables', why: 'Under 60% on 4 days.', how: 'A big salad at lunch.' },
        { title: 'More fibre', why: 'Under 75% on 5 days.', how: 'Oats at breakfast.' },
      ],
      encouragement: 'Keep the streak going.',
      model: 'test-model',
      generatedAt: new Date().toISOString(),
      weekEnd: today(),
      daysLogged: 6,
    }
    const { isoWeek } = await import('@diet-tracker/shared')
    await db.insert(weeklyReviews).values({
      id: uuidv7(),
      userId,
      isoWeek: isoWeek(today()),
      weekEnd: today(),
      review,
    })
    const cached = await send('POST', '/api/v1/ai/weekly-review')
    expect(cached.status).toBe(200)
    const body = weeklyReviewResponseSchema.parse(await cached.json())
    expect(body.review?.summary).toBe('Four of six logged days met.')
    expect(body.daysLogged).toBe(6)

    // Forcing regenerates, which needs the model.
    const forced = await send('POST', '/api/v1/ai/weekly-review?force=1')
    expect(forced.status).toBe(503)
  })

  it('regenerates a review that was generated on an earlier day', async () => {
    await signInAs(finn.email, finn.profile)
    await seedWeek(userId, finn.email, TZ)
    const { isoWeek } = await import('@diet-tracker/shared')
    await db.insert(weeklyReviews).values({
      id: uuidv7(),
      userId,
      isoWeek: isoWeek(today()),
      weekEnd: addDays(today(), -1),
      review: {
        summary: 'Stale.',
        wins: [],
        changes: [],
        encouragement: '',
        model: 'test-model',
        generatedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        weekEnd: addDays(today(), -1),
        daysLogged: 5,
      },
    })
    const res = await send('POST', '/api/v1/ai/weekly-review')
    expect(res.status).toBe(503) // tried to regenerate; no key in tests
  })

  it('counts a day of water alone as unlogged', async () => {
    await signInAs(finn.email, finn.profile)
    const day = today()
    const res = await send('POST', '/api/v1/log/entries', {
      day,
      meal: 'snack',
      loggedAt: new Date().toISOString(),
      entries: [waterEntryInput(250), waterEntryInput(250)],
    })
    expect(res.status).toBe(201)
    const body = weekStatsResponseSchema.parse(
      await (await send('GET', '/api/v1/stats/week')).json(),
    )
    const todayScore = body.days[6]!.score
    expect(todayScore.entryCount).toBe(0)
    expect(todayScore.logged).toBe(false)
    expect(todayScore.scores.water_ml?.actual).toBe(500)
  })
})
