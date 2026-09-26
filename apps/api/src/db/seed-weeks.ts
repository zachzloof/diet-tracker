import {
  addDays,
  emptyFoodGroupServes,
  emptyNutrientVector,
  isWaterEntry,
  localDay,
  sumPortions,
  waterEntryInput,
  type DayTotals,
  type FoodGroupServes,
  type LogEntryInput,
  type Meal,
  type NutrientVector,
} from '@diet-tracker/shared'
import { and, eq } from 'drizzle-orm'
import { db } from './client.js'
import { logEntries } from './schema/index.js'
import { createEntries } from '../log/log-service.js'

/**
 * A week of meals for Finn and Tess (docs/PLAN.md slice 4). Every meal is a fixed vector
 * and every day is a fixed list of meals, so "days met" and the gaps list can be worked
 * out by hand and pinned in `stats.test.ts`. Days are relative to the person's local today:
 * offset 0 is today (one breakfast so far, an unlogged day), -1 is yesterday, and so on.
 *
 * Finn (energy 3250, protein 150, sodium 2300, fibre 45, vegetables 6, water 3250):
 *   -6 F1+F5+F8: 2570 kcal short, protein 108 short, sodium 3680 and alcohol 4 over: missed
 *   -5 F2+F4+F5: 2700 kcal close, protein 150 met, sodium 4200 over: missed
 *   -4 F1+F2+F3+F4+W: 2700 kcal close, protein 185 met, nothing over: met
 *   -3 F1+F2+F6+F7: 3100 met, protein 190 met, sodium 2300 exactly (met): met
 *   -2 F1+F2+F3+F7+W: 2950 met, protein 185 met: met
 *   -1 F1+F4+F6+F7: 2600 close (80% exactly), protein 150 met: met
 *   Days met 4 of 6 logged, streak 4. Gaps: vegetables (4 days under 60%, average 2.5),
 *   fibre (5 days under 75%, average 25.5 g), fruit (4 days, average 1.33), vitamin D
 *   (6 days, average 4.08 mcg), vitamin A (6 days, average 335 mcg), water (4 days, 52%).
 *
 * Tess (energy 1570, protein 100, added sugar 39, iron 18, fruit 2, water 2250):
 *   -6 T1+T2+T5+T4: 2000 kcal over, protein 85 close, added sugar 49 over: missed
 *   -5 T1+T2+T3+W: 1500 met, protein 93 met: met
 *   -4 T1+T4+T5+T7: 1750 close, protein 56 short, added sugar 48 over: missed
 *   -3 T1+T6+T4+T8: 1490 met, protein 62 short, added sugar 47 over: missed
 *   -2 T1+T2+T3+T8+W: 1590 met, protein 102 met: met
 *   -1 T1+T2+T3+T7+W: 1750 close, protein 99 met: met
 *   Days met 3 of 6 logged, streak 2. Gaps: protein (3 days short or close, average 83%),
 *   fruit (4 days, average 1.33), added sugar (3 days over, averaging 123% on those days),
 *   iron (6 days, average 7.75 mg), folate (6 days, average 202 mcg), vitamin A (6 days,
 *   average 383 mcg), water (4 days, 62%).
 */

export interface SeedMeal {
  name: string
  grams: number
  nutrients: NutrientVector
  foodGroups: FoodGroupServes
}

const meal = (
  name: string,
  grams: number,
  nutrients: Partial<NutrientVector>,
  foodGroups: Partial<FoodGroupServes> = {},
): SeedMeal => ({
  name,
  grams,
  nutrients: { ...emptyNutrientVector(), ...nutrients },
  foodGroups: { ...emptyFoodGroupServes(), ...foodGroups },
})

export const SEED_MEALS: Record<string, Record<string, SeedMeal>> = {
  'finn@example.com': {
    F1: meal(
      'Oats with whey and banana',
      450,
      {
        energy_kcal: 700,
        protein_g: 45,
        carbs_g: 100,
        fat_g: 12,
        fiber_g: 10,
        sugar_g: 25,
        added_sugar_g: 5,
        saturated_fat_g: 3,
        sodium_mg: 250,
        potassium_mg: 900,
        calcium_mg: 400,
        iron_mg: 4,
        magnesium_mg: 150,
        zinc_mg: 4,
        vitamin_a_ug: 50,
        vitamin_c_mg: 12,
        vitamin_d_ug: 1,
        vitamin_b12_ug: 1.2,
        folate_ug: 60,
        water_ml: 300,
      },
      { whole_grains: 2, fruit: 1, dairy_or_alt: 1, protein_foods: 0.5 },
    ),
    F2: meal(
      'Chicken, rice and broccoli',
      550,
      {
        energy_kcal: 850,
        protein_g: 65,
        carbs_g: 110,
        fat_g: 14,
        fiber_g: 8,
        sugar_g: 5,
        saturated_fat_g: 3,
        sodium_mg: 700,
        potassium_mg: 1000,
        calcium_mg: 100,
        iron_mg: 3,
        magnesium_mg: 120,
        zinc_mg: 3,
        vitamin_a_ug: 100,
        vitamin_c_mg: 90,
        vitamin_b12_ug: 0.6,
        folate_ug: 120,
        water_ml: 400,
      },
      { vegetables: 2, protein_foods: 1.5 },
    ),
    F3: meal(
      'Salmon, potatoes and salad',
      600,
      {
        energy_kcal: 800,
        protein_g: 50,
        carbs_g: 70,
        fat_g: 35,
        fiber_g: 8,
        sugar_g: 6,
        saturated_fat_g: 7,
        sodium_mg: 500,
        potassium_mg: 1500,
        calcium_mg: 80,
        iron_mg: 2,
        magnesium_mg: 100,
        zinc_mg: 2,
        vitamin_a_ug: 200,
        vitamin_c_mg: 40,
        vitamin_d_ug: 7,
        vitamin_b12_ug: 4,
        folate_ug: 100,
        water_ml: 500,
      },
      { vegetables: 2, protein_foods: 1.5 },
    ),
    F4: meal(
      'Greek yoghurt with berries',
      300,
      {
        energy_kcal: 350,
        protein_g: 25,
        carbs_g: 40,
        fat_g: 10,
        sugar_g: 35,
        added_sugar_g: 15,
        saturated_fat_g: 6,
        sodium_mg: 100,
        potassium_mg: 350,
        calcium_mg: 300,
        magnesium_mg: 30,
        zinc_mg: 1.5,
        vitamin_a_ug: 60,
        vitamin_b12_ug: 1,
        folate_ug: 20,
        water_ml: 200,
      },
      { dairy_or_alt: 1.2, fruit: 1 },
    ),
    F5: meal(
      'Pepperoni pizza, whole',
      550,
      {
        energy_kcal: 1500,
        protein_g: 60,
        carbs_g: 160,
        fat_g: 65,
        fiber_g: 8,
        sugar_g: 15,
        added_sugar_g: 8,
        saturated_fat_g: 28,
        sodium_mg: 3400,
        potassium_mg: 800,
        calcium_mg: 700,
        iron_mg: 6,
        magnesium_mg: 90,
        zinc_mg: 5,
        vitamin_a_ug: 150,
        vitamin_c_mg: 10,
        vitamin_d_ug: 0.5,
        vitamin_b12_ug: 1.5,
        folate_ug: 150,
        water_ml: 300,
      },
      { vegetables: 0.5, dairy_or_alt: 1.5, protein_foods: 1 },
    ),
    F6: meal(
      'Beef pasta bolognese',
      500,
      {
        energy_kcal: 950,
        protein_g: 55,
        carbs_g: 110,
        fat_g: 30,
        fiber_g: 9,
        sugar_g: 12,
        added_sugar_g: 2,
        saturated_fat_g: 11,
        sodium_mg: 900,
        potassium_mg: 1100,
        calcium_mg: 120,
        iron_mg: 6,
        magnesium_mg: 100,
        zinc_mg: 8,
        vitamin_a_ug: 120,
        vitamin_c_mg: 20,
        vitamin_b12_ug: 2.5,
        folate_ug: 90,
        water_ml: 400,
      },
      { vegetables: 1, protein_foods: 1 },
    ),
    F7: meal(
      'Peanut butter toast and milk',
      350,
      {
        energy_kcal: 600,
        protein_g: 25,
        carbs_g: 60,
        fat_g: 28,
        fiber_g: 7,
        sugar_g: 15,
        added_sugar_g: 4,
        saturated_fat_g: 8,
        sodium_mg: 450,
        potassium_mg: 600,
        calcium_mg: 350,
        iron_mg: 2.5,
        magnesium_mg: 100,
        zinc_mg: 2.5,
        vitamin_a_ug: 80,
        vitamin_d_ug: 1.5,
        vitamin_b12_ug: 1,
        folate_ug: 60,
        water_ml: 350,
      },
      { whole_grains: 2, dairy_or_alt: 1, nuts_seeds: 1, protein_foods: 0.5 },
    ),
    F8: meal('Lager, 2 pints', 1136, {
      energy_kcal: 370,
      protein_g: 3,
      carbs_g: 25,
      sodium_mg: 30,
      potassium_mg: 200,
      calcium_mg: 20,
      magnesium_mg: 20,
      folate_ug: 40,
      water_ml: 1000,
      alcohol_std_drinks: 4,
    }),
  },
  'tess@example.com': {
    T1: meal(
      'Porridge with skim milk and banana',
      400,
      {
        energy_kcal: 400,
        protein_g: 18,
        carbs_g: 70,
        fat_g: 6,
        fiber_g: 8,
        sugar_g: 25,
        saturated_fat_g: 2,
        sodium_mg: 120,
        potassium_mg: 800,
        calcium_mg: 350,
        iron_mg: 2.5,
        magnesium_mg: 90,
        zinc_mg: 2,
        vitamin_a_ug: 60,
        vitamin_c_mg: 10,
        vitamin_d_ug: 1.5,
        vitamin_b12_ug: 0.8,
        folate_ug: 40,
        water_ml: 350,
      },
      { whole_grains: 2, fruit: 1, dairy_or_alt: 1 },
    ),
    T2: meal(
      'Chicken salad wrap',
      300,
      {
        energy_kcal: 500,
        protein_g: 35,
        carbs_g: 45,
        fat_g: 18,
        fiber_g: 6,
        sugar_g: 5,
        added_sugar_g: 1,
        saturated_fat_g: 4,
        sodium_mg: 800,
        potassium_mg: 600,
        calcium_mg: 120,
        iron_mg: 2.5,
        magnesium_mg: 60,
        zinc_mg: 2.5,
        vitamin_a_ug: 150,
        vitamin_c_mg: 30,
        vitamin_b12_ug: 0.4,
        folate_ug: 60,
        water_ml: 250,
      },
      { vegetables: 1.5, protein_foods: 1, whole_grains: 1 },
    ),
    T3: meal(
      'Salmon, rice and greens',
      450,
      {
        energy_kcal: 600,
        protein_g: 40,
        carbs_g: 60,
        fat_g: 20,
        fiber_g: 6,
        sugar_g: 4,
        saturated_fat_g: 4,
        sodium_mg: 400,
        potassium_mg: 900,
        calcium_mg: 100,
        iron_mg: 2,
        magnesium_mg: 80,
        zinc_mg: 1.5,
        vitamin_a_ug: 200,
        vitamin_c_mg: 60,
        vitamin_d_ug: 10,
        vitamin_b12_ug: 4,
        folate_ug: 120,
        water_ml: 400,
      },
      { vegetables: 2, protein_foods: 1.5 },
    ),
    T4: meal(
      'Chocolate bar and a latte',
      350,
      {
        energy_kcal: 450,
        protein_g: 10,
        carbs_g: 55,
        fat_g: 20,
        fiber_g: 2,
        sugar_g: 50,
        added_sugar_g: 45,
        saturated_fat_g: 12,
        sodium_mg: 150,
        potassium_mg: 400,
        calcium_mg: 300,
        iron_mg: 1.5,
        magnesium_mg: 50,
        zinc_mg: 1,
        vitamin_a_ug: 80,
        vitamin_d_ug: 1,
        vitamin_b12_ug: 0.9,
        folate_ug: 10,
        water_ml: 250,
      },
      { dairy_or_alt: 1 },
    ),
    T5: meal(
      'Pasta with tomato sauce and cheese',
      400,
      {
        energy_kcal: 650,
        protein_g: 22,
        carbs_g: 90,
        fat_g: 20,
        fiber_g: 7,
        sugar_g: 10,
        added_sugar_g: 3,
        saturated_fat_g: 9,
        sodium_mg: 900,
        potassium_mg: 700,
        calcium_mg: 250,
        iron_mg: 2.5,
        magnesium_mg: 60,
        zinc_mg: 2,
        vitamin_a_ug: 120,
        vitamin_c_mg: 20,
        vitamin_d_ug: 0.3,
        vitamin_b12_ug: 0.5,
        folate_ug: 100,
        water_ml: 300,
      },
      { vegetables: 1, dairy_or_alt: 0.8 },
    ),
    T6: meal(
      'Tofu stir fry with rice',
      450,
      {
        energy_kcal: 550,
        protein_g: 25,
        carbs_g: 65,
        fat_g: 18,
        fiber_g: 7,
        sugar_g: 8,
        added_sugar_g: 2,
        saturated_fat_g: 3,
        sodium_mg: 1000,
        potassium_mg: 700,
        calcium_mg: 350,
        iron_mg: 4,
        magnesium_mg: 100,
        zinc_mg: 2,
        vitamin_a_ug: 250,
        vitamin_c_mg: 70,
        folate_ug: 110,
        water_ml: 400,
      },
      { vegetables: 2.5, protein_foods: 1, legumes: 1 },
    ),
    T7: meal(
      'Apple and almonds',
      180,
      {
        energy_kcal: 250,
        protein_g: 6,
        carbs_g: 25,
        fat_g: 14,
        fiber_g: 6,
        sugar_g: 18,
        saturated_fat_g: 1,
        potassium_mg: 350,
        calcium_mg: 80,
        iron_mg: 1,
        magnesium_mg: 80,
        zinc_mg: 1,
        vitamin_a_ug: 5,
        vitamin_c_mg: 8,
        folate_ug: 5,
        water_ml: 150,
      },
      { fruit: 1, nuts_seeds: 1 },
    ),
    T8: meal(
      'Skim milk, a glass',
      250,
      {
        energy_kcal: 90,
        protein_g: 9,
        carbs_g: 12,
        fat_g: 0.3,
        sugar_g: 12,
        saturated_fat_g: 0.2,
        sodium_mg: 110,
        potassium_mg: 400,
        calcium_mg: 310,
        magnesium_mg: 28,
        zinc_mg: 1,
        vitamin_d_ug: 2.5,
        vitamin_b12_ug: 1.2,
        folate_ug: 12,
        water_ml: 228,
      },
      { dairy_or_alt: 1 },
    ),
  },
}

export interface SeedItem {
  meal: Meal
  hour: number
  /** A key into `SEED_MEALS`, or `W<ml>` for a water quick-add. */
  key: string
}

export interface SeedDay {
  /** 0 is today, -1 yesterday, and so on. */
  offset: number
  items: SeedItem[]
}

const item = (meal: Meal, hour: number, key: string): SeedItem => ({ meal, hour, key })

export const SEED_WEEKS: Record<string, SeedDay[]> = {
  'finn@example.com': [
    {
      offset: -6,
      items: [item('breakfast', 8, 'F1'), item('dinner', 19, 'F5'), item('dinner', 21, 'F8')],
    },
    {
      offset: -5,
      items: [item('lunch', 13, 'F2'), item('snack', 16, 'F4'), item('dinner', 19, 'F5')],
    },
    {
      offset: -4,
      items: [
        item('breakfast', 8, 'F1'),
        item('snack', 10, 'W1000'),
        item('lunch', 13, 'F2'),
        item('snack', 16, 'F4'),
        item('dinner', 19, 'F3'),
      ],
    },
    {
      offset: -3,
      items: [
        item('breakfast', 8, 'F1'),
        item('lunch', 13, 'F2'),
        item('snack', 16, 'F7'),
        item('dinner', 19, 'F6'),
      ],
    },
    {
      offset: -2,
      items: [
        item('breakfast', 8, 'F1'),
        item('snack', 10, 'W1000'),
        item('lunch', 13, 'F2'),
        item('snack', 16, 'F7'),
        item('dinner', 19, 'F3'),
      ],
    },
    {
      offset: -1,
      items: [
        item('breakfast', 8, 'F1'),
        item('snack', 11, 'F4'),
        item('snack', 16, 'F7'),
        item('dinner', 19, 'F6'),
      ],
    },
    { offset: 0, items: [item('breakfast', 8, 'F1')] },
  ],
  'tess@example.com': [
    {
      offset: -6,
      items: [
        item('breakfast', 8, 'T1'),
        item('lunch', 13, 'T2'),
        item('snack', 16, 'T4'),
        item('dinner', 19, 'T5'),
      ],
    },
    {
      offset: -5,
      items: [
        item('breakfast', 8, 'T1'),
        item('snack', 10, 'W500'),
        item('lunch', 13, 'T2'),
        item('dinner', 19, 'T3'),
      ],
    },
    {
      offset: -4,
      items: [
        item('breakfast', 8, 'T1'),
        item('snack', 11, 'T7'),
        item('snack', 16, 'T4'),
        item('dinner', 19, 'T5'),
      ],
    },
    {
      offset: -3,
      items: [
        item('breakfast', 8, 'T1'),
        item('lunch', 13, 'T6'),
        item('snack', 16, 'T4'),
        item('snack', 21, 'T8'),
      ],
    },
    {
      offset: -2,
      items: [
        item('breakfast', 8, 'T1'),
        item('snack', 10, 'W500'),
        item('lunch', 13, 'T2'),
        item('dinner', 19, 'T3'),
        item('snack', 21, 'T8'),
      ],
    },
    {
      offset: -1,
      items: [
        item('breakfast', 8, 'T1'),
        item('snack', 10, 'W500'),
        item('snack', 11, 'T7'),
        item('lunch', 13, 'T2'),
        item('dinner', 19, 'T3'),
      ],
    },
    { offset: 0, items: [item('breakfast', 8, 'T1')] },
  ],
}

function entryFor(email: string, key: string): LogEntryInput {
  const water = /^W(\d+)$/.exec(key)
  if (water) return waterEntryInput(Number(water[1]))
  const found = SEED_MEALS[email]?.[key]
  if (!found) throw new Error(`no seed meal ${key} for ${email}`)
  return {
    name: found.name,
    quantity: 1,
    unit: 'serving',
    grams: found.grams,
    nutrients: found.nutrients,
    foodGroups: found.foodGroups,
    source: 'manual',
    foodId: null,
    aiCallId: null,
    assumptions: [],
    confidence: null,
    brand: null,
    saveToLibrary: false,
  }
}

export interface SeedWeekDay {
  day: string
  totals: DayTotals
}

/** The week's day totals in memory (no database): what `daily_summaries` will hold after seeding. */
export function seedWeekTotals(email: string, today: string): SeedWeekDay[] {
  const plan = SEED_WEEKS[email] ?? []
  return plan.map(({ offset, items }) => {
    const entries = items.map((i) => entryFor(email, i.key))
    const summed = sumPortions(entries)
    return {
      day: addDays(today, offset),
      totals: {
        totals: summed.totals,
        foodGroups: summed.foodGroups,
        entryCount: entries.filter((e) => !isWaterEntry(e)).length,
      },
    }
  })
}

/**
 * Logs the persona's week for `userId`, relative to their local today. Leaves an account
 * that already has log entries alone, so re-seeding never duplicates a week.
 */
export async function seedWeek(
  userId: string,
  email: string,
  timeZone: string,
  now: Date = new Date(),
): Promise<number> {
  const existing = await db
    .select({ id: logEntries.id })
    .from(logEntries)
    .where(and(eq(logEntries.userId, userId)))
    .limit(1)
  if (existing.length > 0) return 0

  const today = localDay(now, timeZone)
  let count = 0
  for (const { offset, items } of SEED_WEEKS[email] ?? []) {
    const day = addDays(today, offset)
    for (const i of items) {
      const loggedAt = new Date(`${day}T${String(i.hour).padStart(2, '0')}:00:00Z`)
      await createEntries(
        userId,
        { day, meal: i.meal, loggedAt: loggedAt.toISOString(), entries: [entryFor(email, i.key)] },
        loggedAt,
      )
      count += 1
    }
  }
  return count
}
