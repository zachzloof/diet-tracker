import {
  MAX_SAVED_MEALS,
  MAX_SAVED_MEAL_ITEMS,
  NO_FLAGS,
  apiErrorSchema,
  createEntriesResponseSchema,
  dayLogResponseSchema,
  emptyFoodGroupServes,
  emptyNutrientVector,
  foodResponseSchema,
  foodsResponseSchema,
  portionOf,
  savedMealEntries,
  savedMealResponseSchema,
  savedMealTotals,
  savedMealsResponseSchema,
  type Food,
  type FoodInput,
  type ProfileInput,
  type SavedMeal,
  type SavedMealInput,
  type SavedMealItem,
} from '@diet-tracker/shared'
import { sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { SESSION_COOKIE } from '../auth/session-service.js'
import { db } from '../db/client.js'
import { aiCalls, logEntries, savedMealItems, savedMeals } from '../db/schema/index.js'
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

const oats: FoodInput = {
  name: 'Rolled oats',
  brand: null,
  basis: 'per_100g',
  servingGrams: null,
  servingLabel: null,
  nutrients: { ...emptyNutrientVector(), energy_kcal: 380, protein_g: 13, carbs_g: 60, fat_g: 7 },
  foodGroups: { ...emptyFoodGroupServes(), whole_grains: 3.3 },
}

const milk: FoodInput = {
  name: 'Skim milk',
  brand: null,
  basis: 'per_100g',
  servingGrams: null,
  servingLabel: null,
  nutrients: { ...emptyNutrientVector(), energy_kcal: 35, protein_g: 3.5, carbs_g: 5 },
  foodGroups: { ...emptyFoodGroupServes(), dairy_or_alt: 0.4 },
}

/** Typed in by hand: no library food behind it. */
const banana: SavedMealItem = {
  name: 'Banana',
  quantity: 1,
  unit: 'medium',
  grams: 120,
  nutrients: { ...emptyNutrientVector(), energy_kcal: 105, protein_g: 1.3, carbs_g: 27 },
  foodGroups: { ...emptyFoodGroupServes(), fruit: 0.8 },
  foodId: null,
}

const DAY = '2026-10-01'
const LOGGED_AT = '2026-10-01T07:30:00.000Z'

let cookie = ''

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

async function addFood(input: FoodInput): Promise<Food> {
  const res = await send('POST', '/api/v1/foods', input)
  expect(res.status).toBe(201)
  return foodResponseSchema.parse(await res.json()).food
}

/** `grams` of a per-100g library food as a meal ingredient, the way the editor builds it. */
function ingredient(food: Food, grams: number): SavedMealItem {
  const portion = portionOf(food, grams)
  return {
    name: food.name,
    quantity: grams,
    unit: 'g',
    grams,
    nutrients: portion.nutrients,
    foodGroups: portion.foodGroups,
    foodId: food.id,
  }
}

async function listMeals(): Promise<SavedMeal[]> {
  const res = await send('GET', '/api/v1/meals')
  expect(res.status).toBe(200)
  return savedMealsResponseSchema.parse(await res.json()).meals
}

async function createMeal(input: SavedMealInput): Promise<SavedMeal> {
  const res = await send('POST', '/api/v1/meals', input)
  expect(res.status).toBe(201)
  return savedMealResponseSchema.parse(await res.json()).meal
}

/** Overnight oats: 50 g oats (190 kcal), 200 g milk (70 kcal), a banana (105 kcal). */
async function overnightOats(): Promise<{ meal: SavedMeal; oatsFood: Food; milkFood: Food }> {
  const oatsFood = await addFood(oats)
  const milkFood = await addFood(milk)
  const meal = await createMeal({
    name: 'Overnight oats',
    items: [ingredient(oatsFood, 50), ingredient(milkFood, 200), banana],
  })
  return { meal, oatsFood, milkFood }
}

beforeEach(async () => {
  resetRateLimits()
  await db.execute(
    sql`truncate table saved_meal_items, saved_meals, log_entries, daily_summaries, foods, ai_calls, weight_entries, target_versions, profiles, sessions, users cascade`,
  )
  cookie = (await register('finn@example.com')).cookie
  await send('PUT', '/api/v1/profile', finn)
})

describe('saved meals', () => {
  it('starts empty and saves a meal from two library foods and a typed ingredient', async () => {
    expect(await listMeals()).toEqual([])

    const { meal, oatsFood, milkFood } = await overnightOats()
    expect(meal.name).toBe('Overnight oats')
    expect(meal.lastUsedAt).toBeNull()
    // Ingredients come back in the order they were added, each with its own numbers.
    expect(meal.items.map((item) => item.name)).toEqual(['Rolled oats', 'Skim milk', 'Banana'])
    expect(meal.items.map((item) => item.foodId)).toEqual([oatsFood.id, milkFood.id, null])
    expect(meal.items[0]).toMatchObject({ quantity: 50, unit: 'g', grams: 50 })
    expect(meal.items[0]?.nutrients.energy_kcal).toBe(190)
    expect(meal.items[2]?.foodGroups.fruit).toBe(0.8)
    const totals = savedMealTotals(meal.items)
    expect(totals.totals.energy_kcal).toBe(365)
    expect(totals.totals.protein_g).toBe(14.8)

    expect(await listMeals()).toEqual([meal])
  })

  it('refuses a meal with no name, no ingredients, too many or a stray nutrient', async () => {
    const bad = async (input: unknown, field: string) => {
      const res = await send('POST', '/api/v1/meals', input)
      expect(res.status).toBe(400)
      const details = apiErrorSchema.parse(await res.json()).error.details
      expect(JSON.stringify(details)).toContain(field)
    }
    await bad({ name: '  ', items: [banana] }, 'name')
    await bad({ name: 'Nothing', items: [] }, 'items')
    await bad(
      { name: 'Feast', items: Array.from({ length: MAX_SAVED_MEAL_ITEMS + 1 }, () => banana) },
      'items',
    )
    await bad(
      {
        name: 'Stray',
        items: [{ ...banana, nutrients: { ...banana.nutrients, caffeine_mg: 80 } }],
      },
      'items',
    )
    expect(await db.select().from(savedMeals)).toHaveLength(0)
  })

  it('renames a meal and replaces its ingredients, then deletes it', async () => {
    const { meal, oatsFood } = await overnightOats()

    const res = await send('PATCH', `/api/v1/meals/${meal.id}`, {
      name: 'Big oats',
      items: [ingredient(oatsFood, 80), banana],
    })
    expect(res.status).toBe(200)
    const edited = savedMealResponseSchema.parse(await res.json()).meal
    expect(edited.id).toBe(meal.id)
    expect(edited.name).toBe('Big oats')
    expect(edited.items.map((item) => item.name)).toEqual(['Rolled oats', 'Banana'])
    expect(edited.items[0]?.grams).toBe(80)
    expect(edited.items[0]?.nutrients.energy_kcal).toBe(304)
    expect(await db.select().from(savedMealItems)).toHaveLength(2)
    expect(await listMeals()).toEqual([edited])

    expect((await send('DELETE', `/api/v1/meals/${meal.id}`)).status).toBe(204)
    expect(await listMeals()).toEqual([])
    expect(await db.select().from(savedMealItems)).toHaveLength(0)

    expect((await send('DELETE', `/api/v1/meals/${meal.id}`)).status).toBe(404)
    expect(
      (await send('PATCH', `/api/v1/meals/${meal.id}`, { name: 'x', items: [banana] })).status,
    ).toBe(404)
    expect((await send('DELETE', '/api/v1/meals/not-a-uuid')).status).toBe(404)
  })

  it('logs a meal as one entry per ingredient with no AI call and moves it to the top', async () => {
    const { meal, oatsFood } = await overnightOats()
    const second = await createMeal({ name: 'Just a banana', items: [banana] })
    // Newest edit first until something is logged.
    expect((await listMeals()).map((m) => m.id)).toEqual([second.id, meal.id])

    const res = await send('POST', '/api/v1/log/entries', {
      day: DAY,
      meal: 'breakfast',
      loggedAt: LOGGED_AT,
      entries: savedMealEntries(meal.items),
      savedMealId: meal.id,
    })
    expect(res.status).toBe(201)
    const logged = createEntriesResponseSchema.parse(await res.json())
    expect(logged.entries.map((e) => e.name)).toEqual(['Rolled oats', 'Skim milk', 'Banana'])
    expect(logged.entries.map((e) => e.source)).toEqual(['library', 'library', 'manual'])
    expect(logged.entries.every((e) => e.meal === 'breakfast')).toBe(true)
    expect(logged.foodsSaved).toBe(0)
    // Today rises by exactly the meal's totals.
    expect(logged.summary.entryCount).toBe(3)
    expect(logged.summary.totals.energy_kcal).toBe(365)
    expect(logged.summary.totals.protein_g).toBe(14.8)
    expect(logged.summary.foodGroups.whole_grains).toBe(1.65)
    expect(await db.select().from(aiCalls)).toHaveLength(0)

    const after = await listMeals()
    expect(after.map((m) => m.id)).toEqual([meal.id, second.id])
    expect(after[0]?.lastUsedAt).not.toBeNull()
    expect(after[1]?.lastUsedAt).toBeNull()
    // The meal itself is unchanged by being logged.
    expect(after[0]?.items).toEqual(meal.items)
    // The library foods it used count as used too.
    const library = foodsResponseSchema.parse(await (await send('GET', '/api/v1/foods')).json())
    expect(library.foods.find((f) => f.id === oatsFood.id)?.lastUsedAt).not.toBeNull()
  })

  it('logs half a portion, and a portion with one ingredient left out, without changing the meal', async () => {
    const { meal } = await overnightOats()

    const half = createEntriesResponseSchema.parse(
      await (
        await send('POST', '/api/v1/log/entries', {
          day: DAY,
          meal: 'breakfast',
          loggedAt: LOGGED_AT,
          entries: savedMealEntries(meal.items, 0.5),
          savedMealId: meal.id,
        })
      ).json(),
    )
    expect(half.summary.totals.energy_kcal).toBe(182.5)
    expect(half.entries[0]).toMatchObject({ quantity: 25, grams: 25 })

    // No banana this time, on another day.
    const without = createEntriesResponseSchema.parse(
      await (
        await send('POST', '/api/v1/log/entries', {
          day: '2026-09-30',
          meal: 'snack',
          loggedAt: LOGGED_AT,
          entries: savedMealEntries(meal.items.filter((item) => item.name !== 'Banana')),
          savedMealId: meal.id,
        })
      ).json(),
    )
    expect(without.summary.entryCount).toBe(2)
    expect(without.summary.totals.energy_kcal).toBe(260)

    expect((await listMeals())[0]?.items).toEqual(meal.items)
  })

  it('keeps its numbers when a food it uses is edited, and the ingredient when it is deleted', async () => {
    const { oatsFood } = await overnightOats()

    const edited = await send('PATCH', `/api/v1/foods/${oatsFood.id}`, {
      ...oats,
      nutrients: { ...oats.nutrients, energy_kcal: 400 },
    })
    expect(edited.status).toBe(200)
    expect((await listMeals())[0]?.items[0]?.nutrients.energy_kcal).toBe(190)

    expect((await send('DELETE', `/api/v1/foods/${oatsFood.id}`)).status).toBe(204)
    const after = (await listMeals())[0]!
    expect(after.items).toHaveLength(3)
    expect(after.items[0]).toMatchObject({ name: 'Rolled oats', grams: 50, foodId: null })
    expect(after.items[0]?.nutrients.energy_kcal).toBe(190)

    // It still logs, now as a manual entry for that ingredient.
    const logged = createEntriesResponseSchema.parse(
      await (
        await send('POST', '/api/v1/log/entries', {
          day: DAY,
          meal: 'breakfast',
          loggedAt: LOGGED_AT,
          entries: savedMealEntries(after.items),
          savedMealId: after.id,
        })
      ).json(),
    )
    expect(logged.entries.map((e) => e.source)).toEqual(['manual', 'library', 'manual'])
    expect(logged.summary.totals.energy_kcal).toBe(365)
  })

  it('leaves logged entries alone when the meal is edited or deleted', async () => {
    const { meal } = await overnightOats()
    await send('POST', '/api/v1/log/entries', {
      day: DAY,
      meal: 'breakfast',
      loggedAt: LOGGED_AT,
      entries: savedMealEntries(meal.items),
      savedMealId: meal.id,
    })
    await send('PATCH', `/api/v1/meals/${meal.id}`, { name: 'Only banana', items: [banana] })
    expect((await send('DELETE', `/api/v1/meals/${meal.id}`)).status).toBe(204)

    const day = dayLogResponseSchema.parse(
      await (await send('GET', `/api/v1/log/day/${DAY}`)).json(),
    )
    expect(day.entries).toHaveLength(3)
    expect(day.summary.totals.energy_kcal).toBe(365)
    expect(await db.select().from(logEntries)).toHaveLength(3)
  })

  it('keeps one person’s meals and foods away from another', async () => {
    const { meal, oatsFood } = await overnightOats()
    const mine = cookie
    cookie = (await register('tess@example.com')).cookie
    await send('PUT', '/api/v1/profile', { ...finn, sex: 'female' })

    expect(await listMeals()).toEqual([])
    expect(
      (await send('PATCH', `/api/v1/meals/${meal.id}`, { name: 'Mine now', items: [banana] }))
        .status,
    ).toBe(404)
    expect((await send('DELETE', `/api/v1/meals/${meal.id}`)).status).toBe(404)

    // Somebody else's food id is not kept as a link; the ingredient's own numbers are.
    const theirs = await createMeal({ name: 'Borrowed oats', items: [ingredient(oatsFood, 50)] })
    expect(theirs.items[0]?.foodId).toBeNull()
    expect(theirs.items[0]?.nutrients.energy_kcal).toBe(190)

    // Logging with somebody else's meal id logs the entries and touches nothing of theirs.
    const logged = await send('POST', '/api/v1/log/entries', {
      day: DAY,
      meal: 'lunch',
      loggedAt: LOGGED_AT,
      entries: savedMealEntries(theirs.items),
      savedMealId: meal.id,
    })
    expect(logged.status).toBe(201)

    cookie = mine
    const stillMine = await listMeals()
    expect(stillMine).toHaveLength(1)
    expect(stillMine[0]?.name).toBe('Overnight oats')
    expect(stillMine[0]?.lastUsedAt).toBeNull()
  })

  it('stops at the cap with a message that says what to do', async () => {
    const now = new Date()
    const userRows = await db.execute<{ id: string }>(sql`select id from users limit 1`)
    const userId = userRows.rows[0]!.id
    await db.insert(savedMeals).values(
      Array.from({ length: MAX_SAVED_MEALS }, (_, i) => ({
        id: uuidv7(),
        userId,
        name: `Meal ${i + 1}`,
        createdAt: now,
        updatedAt: now,
      })),
    )
    const res = await send('POST', '/api/v1/meals', { name: 'One too many', items: [banana] })
    expect(res.status).toBe(409)
    expect(apiErrorSchema.parse(await res.json()).error.message).toMatch(/up to 100 meals/)
  })

  it('needs a session', async () => {
    cookie = ''
    expect((await send('GET', '/api/v1/meals')).status).toBe(401)
    expect((await send('POST', '/api/v1/meals', { name: 'x', items: [banana] })).status).toBe(401)
  })
})
