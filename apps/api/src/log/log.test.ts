import {
  NO_FLAGS,
  apiErrorSchema,
  createEntriesResponseSchema,
  dayLogResponseSchema,
  deleteEntryResponseSchema,
  emptyFoodGroupServes,
  emptyNutrientVector,
  foodResponseSchema,
  foodsResponseSchema,
  portionOf,
  updateEntryResponseSchema,
  type FoodInput,
  type LogEntryInput,
  type ProfileInput,
} from '@diet-tracker/shared'
import { sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { SESSION_COOKIE } from '../auth/session-service.js'
import { db } from '../db/client.js'
import { aiCalls, foods, logEntries } from '../db/schema/index.js'
import { resetRateLimits } from '../middleware/rate-limit.js'

const app = createApp()

const finn: ProfileInput = {
  sex: 'male',
  dob: '1998-06-15',
  heightCm: 178,
  weightKg: 75,
  bodyFatPct: null,
  goal: 'gain',
  pace: 'lean',
  goalWeightKg: 80,
  activity: 'high',
  trainingType: 'combat',
  trainingDaysPerWeek: 6,
  dietPattern: 'omnivore',
  allergies: [],
  dislikes: [],
  timezone: 'Europe/London',
  units: 'metric',
  flags: NO_FLAGS,
}

const eggs: LogEntryInput = {
  name: 'Egg, whole, large, boiled',
  quantity: 4,
  unit: 'egg',
  grams: 200,
  nutrients: { ...emptyNutrientVector(), energy_kcal: 310, protein_g: 25, fat_g: 21 },
  foodGroups: { ...emptyFoodGroupServes(), protein_foods: 2 },
  source: 'ai',
  foodId: null,
  aiCallId: null,
  assumptions: ['assumed large eggs (50 g each)'],
  confidence: 'high',
  brand: null,
  saveToLibrary: false,
}

const toast: LogEntryInput = {
  name: 'Wholegrain toast with butter',
  quantity: 2,
  unit: 'slice',
  grams: 80,
  nutrients: { ...emptyNutrientVector(), energy_kcal: 230, protein_g: 7, carbs_g: 28, fat_g: 10 },
  foodGroups: { ...emptyFoodGroupServes(), whole_grains: 2 },
  source: 'ai',
  foodId: null,
  aiCallId: null,
  assumptions: [],
  confidence: 'medium',
  brand: 'Hovis',
  saveToLibrary: true,
}

const oats: FoodInput = {
  name: 'Rolled oats',
  brand: null,
  basis: 'per_100g',
  servingGrams: null,
  servingLabel: null,
  nutrients: { ...emptyNutrientVector(), energy_kcal: 380, protein_g: 13, carbs_g: 60, fat_g: 7 },
  foodGroups: { ...emptyFoodGroupServes(), whole_grains: 3.3 },
}

const DAY = '2026-09-26'
const LOGGED_AT = '2026-09-26T07:30:00.000Z'

let cookie = ''
let userId = ''

function send(method: 'GET' | 'PUT' | 'PATCH' | 'POST' | 'DELETE', path: string, body?: unknown) {
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

async function errorBody(res: Response) {
  return apiErrorSchema.parse(await res.json()).error
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

beforeEach(async () => {
  resetRateLimits()
  await db.execute(
    sql`truncate table log_entries, daily_summaries, foods, ai_calls, weight_entries, target_versions, profiles, sessions, users cascade`,
  )
  const registered = await register('finn@example.com')
  cookie = registered.cookie
  userId = registered.id
  await send('PUT', '/api/v1/profile', finn)
})

describe('day log', () => {
  it('is empty before anything is logged', async () => {
    const res = await send('GET', `/api/v1/log/day/${DAY}`)
    expect(res.status).toBe(200)
    const body = dayLogResponseSchema.parse(await res.json())
    expect(body.entries).toEqual([])
    expect(body.summary.entryCount).toBe(0)
    expect(body.summary.totals.energy_kcal).toBe(0)

    const bad = await send('GET', '/api/v1/log/day/26-09-2026')
    expect(bad.status).toBe(400)
  })

  it('logs AI items, keeps the summary in step and saves a confirmed item to My foods', async () => {
    const res = await send('POST', '/api/v1/log/entries', {
      day: DAY,
      meal: 'breakfast',
      loggedAt: LOGGED_AT,
      entries: [eggs, toast],
    })
    expect(res.status).toBe(201)
    const body = createEntriesResponseSchema.parse(await res.json())
    expect(body.entries).toHaveLength(2)
    expect(body.entries[0]?.meal).toBe('breakfast')
    expect(body.entries[0]?.assumptions).toEqual(['assumed large eggs (50 g each)'])
    expect(body.summary.entryCount).toBe(2)
    expect(body.summary.totals.energy_kcal).toBe(540)
    expect(body.summary.totals.protein_g).toBe(32)
    expect(body.summary.foodGroups.protein_foods).toBe(2)
    expect(body.summary.foodGroups.whole_grains).toBe(2)
    expect(body.foodsSaved).toBe(1)
    expect(body.entries[1]?.foodId).toBeTruthy()

    const library = foodsResponseSchema.parse(await (await send('GET', '/api/v1/foods')).json())
    expect(library.foods).toHaveLength(1)
    const saved = library.foods[0]!
    expect(saved.name).toBe('Wholegrain toast with butter')
    expect(saved.basis).toBe('per_serving')
    expect(saved.servingGrams).toBe(80)
    expect(saved.servingLabel).toBe('2 slice')
    expect(saved.brand).toBe('Hovis')
    expect(saved.source).toBe('ai')
    expect(saved.verified).toBe(true)
    expect(saved.lastUsedAt).not.toBeNull()

    const day = dayLogResponseSchema.parse(
      await (await send('GET', `/api/v1/log/day/${DAY}`)).json(),
    )
    expect(day.entries).toHaveLength(2)
    expect(day.summary.totals.energy_kcal).toBe(540)
  })

  it('edits a quantity, moves an entry to another day and deletes it, updating both summaries', async () => {
    const created = createEntriesResponseSchema.parse(
      await (
        await send('POST', '/api/v1/log/entries', {
          day: DAY,
          meal: 'breakfast',
          loggedAt: LOGGED_AT,
          entries: [eggs],
        })
      ).json(),
    )
    const id = created.entries[0]!.id

    // Three eggs instead of four: the client rescales and sends the new totals.
    const edited = await send('PATCH', `/api/v1/log/entries/${id}`, {
      quantity: 3,
      grams: 150,
      nutrients: { ...eggs.nutrients, energy_kcal: 232.5, protein_g: 18.75, fat_g: 15.75 },
      foodGroups: { ...eggs.foodGroups, protein_foods: 1.5 },
    })
    expect(edited.status).toBe(200)
    const editedBody = updateEntryResponseSchema.parse(await edited.json())
    expect(editedBody.entry.quantity).toBe(3)
    expect(editedBody.summaries).toHaveLength(1)
    expect(editedBody.summaries[0]?.totals.energy_kcal).toBe(232.5)

    // A late-night entry moved to the previous day, and into dinner.
    const moved = updateEntryResponseSchema.parse(
      await (
        await send('PATCH', `/api/v1/log/entries/${id}`, { day: '2026-09-25', meal: 'dinner' })
      ).json(),
    )
    expect(moved.entry.day).toBe('2026-09-25')
    expect(moved.entry.meal).toBe('dinner')
    const byDay = Object.fromEntries(moved.summaries.map((s) => [s.day, s]))
    expect(byDay[DAY]?.entryCount).toBe(0)
    expect(byDay['2026-09-25']?.entryCount).toBe(1)
    expect(byDay['2026-09-25']?.totals.energy_kcal).toBe(232.5)

    const deleted = await send('DELETE', `/api/v1/log/entries/${id}`)
    expect(deleted.status).toBe(200)
    expect(deleteEntryResponseSchema.parse(await deleted.json()).summary.entryCount).toBe(0)
    expect(await db.select().from(logEntries)).toHaveLength(0)

    expect((await send('PATCH', `/api/v1/log/entries/${id}`, { meal: 'lunch' })).status).toBe(404)
    expect((await send('PATCH', `/api/v1/log/entries/${id}`, {})).status).toBe(400)
  })

  it('refuses another user’s food and entry', async () => {
    const other = await register('tess@example.com')
    const mine = cookie
    cookie = other.cookie
    await send('PUT', '/api/v1/profile', { ...finn, sex: 'female' })
    const theirs = foodResponseSchema.parse(
      await (await send('POST', '/api/v1/foods', oats)).json(),
    )
    const theirEntry = createEntriesResponseSchema.parse(
      await (
        await send('POST', '/api/v1/log/entries', {
          day: DAY,
          meal: 'lunch',
          loggedAt: LOGGED_AT,
          entries: [eggs],
        })
      ).json(),
    )
    cookie = mine

    const res = await send('POST', '/api/v1/log/entries', {
      day: DAY,
      meal: 'lunch',
      loggedAt: LOGGED_AT,
      entries: [{ ...eggs, source: 'library', foodId: theirs.food.id }],
    })
    expect(res.status).toBe(400)
    expect((await errorBody(res)).details).toMatchObject({
      fieldErrors: { foodId: ['That food is not in your library'] },
    })
    expect((await send('DELETE', `/api/v1/log/entries/${theirEntry.entries[0]!.id}`)).status).toBe(
      404,
    )
    const mineToday = dayLogResponseSchema.parse(
      await (await send('GET', `/api/v1/log/day/${DAY}`)).json(),
    )
    expect(mineToday.entries).toEqual([])
  })

  it('needs a session', async () => {
    cookie = ''
    expect((await send('GET', `/api/v1/log/day/${DAY}`)).status).toBe(401)
    expect((await send('GET', '/api/v1/foods')).status).toBe(401)
  })
})

describe('foods library', () => {
  it('creates, searches, edits, re-logs with a different portion and deletes a manual food', async () => {
    const created = await send('POST', '/api/v1/foods', oats)
    expect(created.status).toBe(201)
    const food = foodResponseSchema.parse(await created.json()).food
    expect(food.source).toBe('manual')
    expect(food.verified).toBe(true)
    expect(food.lastUsedAt).toBeNull()

    const found = foodsResponseSchema.parse(await (await send('GET', '/api/v1/foods?q=OAT')).json())
    expect(found.foods.map((f) => f.id)).toEqual([food.id])
    const none = foodsResponseSchema.parse(
      await (await send('GET', '/api/v1/foods?q=chicken')).json(),
    )
    expect(none.foods).toEqual([])

    const edited = foodResponseSchema.parse(
      await (await send('PATCH', `/api/v1/foods/${food.id}`, { ...oats, brand: 'Quaker' })).json(),
    ).food
    expect(edited.brand).toBe('Quaker')

    // Re-log 50 g: the client computes the portion with the shared function, no AI call.
    const portion = portionOf(
      {
        basis: edited.basis,
        servingGrams: edited.servingGrams,
        nutrients: edited.nutrients,
        foodGroups: edited.foodGroups,
      },
      50,
    )
    const logged = createEntriesResponseSchema.parse(
      await (
        await send('POST', '/api/v1/log/entries', {
          day: DAY,
          meal: 'breakfast',
          loggedAt: LOGGED_AT,
          entries: [
            {
              name: edited.name,
              quantity: 50,
              unit: 'g',
              grams: 50,
              nutrients: portion.nutrients,
              foodGroups: portion.foodGroups,
              source: 'library',
              foodId: edited.id,
              aiCallId: null,
              assumptions: [],
              confidence: null,
            },
          ],
        })
      ).json(),
    )
    expect(logged.summary.totals.energy_kcal).toBe(190)
    expect(logged.summary.totals.protein_g).toBe(6.5)
    expect(logged.summary.foodGroups.whole_grains).toBe(1.65)
    expect(logged.entries[0]?.source).toBe('library')
    expect(await db.select().from(aiCalls)).toHaveLength(0)

    const touched = foodsResponseSchema.parse(await (await send('GET', '/api/v1/foods')).json())
    expect(touched.foods[0]?.lastUsedAt).not.toBeNull()

    expect((await send('DELETE', `/api/v1/foods/${food.id}`)).status).toBe(204)
    expect(await db.select().from(foods)).toHaveLength(0)
    // The log entry survives with its snapshot; only the link is gone.
    const day = dayLogResponseSchema.parse(
      await (await send('GET', `/api/v1/log/day/${DAY}`)).json(),
    )
    expect(day.entries[0]?.foodId).toBeNull()
    expect(day.summary.totals.energy_kcal).toBe(190)
    expect((await send('DELETE', `/api/v1/foods/${food.id}`)).status).toBe(404)
    expect((await send('DELETE', '/api/v1/foods/not-a-uuid')).status).toBe(404)
  })

  it('rejects a per-serving food without serving grams and a stray nutrient key', async () => {
    const noServing = await send('POST', '/api/v1/foods', { ...oats, basis: 'per_serving' })
    expect(noServing.status).toBe(400)
    expect((await errorBody(noServing)).details).toMatchObject({
      fieldErrors: { servingGrams: ['Enter the grams in one serving'] },
    })
    const stray = await send('POST', '/api/v1/foods', {
      ...oats,
      nutrients: { ...oats.nutrients, caffeine_mg: 80 },
    })
    expect(stray.status).toBe(400)
  })
})

describe('POST /api/v1/ai/estimate', () => {
  it('answers ai_unavailable with the estimator message when no key is configured', async () => {
    const res = await send('POST', '/api/v1/ai/estimate', { text: '4 eggs' })
    expect(res.status).toBe(503)
    const error = await errorBody(res)
    expect(error.code).toBe('ai_unavailable')
    expect(error.message).toMatch(/add this meal manually/)
    // The manual path is unaffected.
    expect((await send('POST', '/api/v1/foods', oats)).status).toBe(201)
  })

  it('blocks further calls once the daily cap is reached, with a clear message', async () => {
    // Three calls today (the test cap) for this user; one from yesterday must not count.
    const today = new Date()
    await db.insert(aiCalls).values(
      [0, 1, 2].map(() => ({
        id: uuidv7(),
        userId,
        purpose: 'estimate' as const,
        model: 'test',
        inputTokens: 10,
        outputTokens: 10,
        latencyMs: 1,
        ok: true,
        error: null,
        createdAt: today,
      })),
    )
    const res = await send('POST', '/api/v1/ai/estimate', { text: 'a banana' })
    expect(res.status).toBe(429)
    const error = await errorBody(res)
    expect(error.code).toBe('ai_cap_reached')
    expect(error.message).toMatch(/used today's 3 AI estimates/)
    expect(error.details).toEqual({ cap: 3, used: 3 })
  })

  it('does not count yesterday’s calls against today', async () => {
    const yesterday = new Date(Date.now() - 36 * 60 * 60 * 1000)
    await db.insert(aiCalls).values(
      [0, 1, 2].map(() => ({
        id: uuidv7(),
        userId,
        purpose: 'estimate' as const,
        model: 'test',
        inputTokens: 10,
        outputTokens: 10,
        latencyMs: 1,
        ok: true,
        error: null,
        createdAt: yesterday,
      })),
    )
    // Under the cap, so it reaches the (unconfigured) client and fails there instead.
    const res = await send('POST', '/api/v1/ai/estimate', { text: 'a banana' })
    expect(res.status).toBe(503)
  })

  it('validates the text', async () => {
    expect((await send('POST', '/api/v1/ai/estimate', { text: '' })).status).toBe(400)
    expect((await send('POST', '/api/v1/ai/estimate', { text: 'x'.repeat(501) })).status).toBe(400)
  })
})
