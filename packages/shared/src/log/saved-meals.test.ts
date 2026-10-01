import { describe, expect, it } from 'vitest'
import { emptyFoodGroupServes, emptyNutrientVector } from '../nutrition/nutrients.js'
import { MAX_SAVED_MEAL_PORTIONS, savedMealEntries, savedMealTotals } from './saved-meals.js'
import {
  MAX_SAVED_MEAL_ITEMS,
  createEntriesRequestSchema,
  logEntryInputSchema,
  savedMealInputSchema,
  type SavedMealItem,
} from './schemas.js'

/**
 * Overnight oats, worked by hand: 50 g oats at 380 kcal and 13 g protein per 100 g is
 * 190 kcal and 6.5 g; 200 g skim milk at 35 kcal and 3.5 g per 100 g is 70 kcal and 7 g;
 * one banana typed in by hand is 105 kcal and 1.3 g. One portion: 365 kcal, 14.8 g protein.
 */
const oats: SavedMealItem = {
  name: 'Rolled oats',
  quantity: 50,
  unit: 'g',
  grams: 50,
  nutrients: { ...emptyNutrientVector(), energy_kcal: 190, protein_g: 6.5, carbs_g: 30 },
  foodGroups: { ...emptyFoodGroupServes(), whole_grains: 1.65 },
  foodId: '0199a3f0-0000-7000-8000-000000000001',
}
const milk: SavedMealItem = {
  name: 'Skim milk',
  quantity: 200,
  unit: 'g',
  grams: 200,
  nutrients: { ...emptyNutrientVector(), energy_kcal: 70, protein_g: 7, carbs_g: 10 },
  foodGroups: { ...emptyFoodGroupServes(), dairy_or_alt: 0.8 },
  foodId: '0199a3f0-0000-7000-8000-000000000002',
}
const banana: SavedMealItem = {
  name: 'Banana',
  quantity: 1,
  unit: 'medium',
  grams: 120,
  nutrients: { ...emptyNutrientVector(), energy_kcal: 105, protein_g: 1.3, carbs_g: 27 },
  foodGroups: { ...emptyFoodGroupServes(), fruit: 0.8 },
  foodId: null,
}
const items = [oats, milk, banana]

describe('savedMealTotals', () => {
  it('adds the ingredients of one portion', () => {
    const totals = savedMealTotals(items)
    expect(totals.entryCount).toBe(3)
    expect(totals.totals.energy_kcal).toBe(365)
    expect(totals.totals.protein_g).toBe(14.8)
    expect(totals.totals.carbs_g).toBe(67)
    expect(totals.foodGroups.whole_grains).toBe(1.65)
    expect(totals.foodGroups.fruit).toBe(0.8)
  })
})

describe('savedMealEntries', () => {
  it('logs one portion as one entry per ingredient with the saved numbers', () => {
    const entries = savedMealEntries(items)
    expect(entries.map((e) => e.name)).toEqual(['Rolled oats', 'Skim milk', 'Banana'])
    expect(entries[0]).toMatchObject({ quantity: 50, unit: 'g', grams: 50 })
    expect(entries[0]?.nutrients).toEqual(oats.nutrients)
    expect(entries[2]?.foodGroups).toEqual(banana.foodGroups)
    // Every entry is one the log endpoint accepts, and none claims an AI call.
    for (const entry of entries) {
      expect(logEntryInputSchema.safeParse(entry).success).toBe(true)
      expect(entry.aiCallId).toBeNull()
      expect(entry.saveToLibrary).toBe(false)
    }
  })

  it('marks linked ingredients as library entries and typed ones as manual', () => {
    const entries = savedMealEntries(items)
    expect(entries.map((e) => e.source)).toEqual(['library', 'library', 'manual'])
    expect(entries.map((e) => e.foodId)).toEqual([oats.foodId, milk.foodId, null])
  })

  it('scales every ingredient for half a portion and for two', () => {
    const half = savedMealEntries(items, 0.5)
    expect(half[0]).toMatchObject({ quantity: 25, grams: 25 })
    expect(half[0]?.nutrients.energy_kcal).toBe(95)
    expect(half[2]).toMatchObject({ quantity: 0.5, grams: 60 })
    expect(half.reduce((sum, e) => sum + e.nutrients.energy_kcal, 0)).toBe(182.5)

    const double = savedMealEntries(items, 2)
    expect(double.reduce((sum, e) => sum + e.nutrients.energy_kcal, 0)).toBe(730)
    expect(double[1]?.foodGroups.dairy_or_alt).toBe(1.6)
    // The saved meal itself is untouched.
    expect(oats.grams).toBe(50)
  })

  it('rounds away float noise', () => {
    const third = savedMealEntries([banana], 1 / 3)
    expect(third[0]?.quantity).toBe(0.333)
    expect(third[0]?.grams).toBe(40)
    expect(third[0]?.nutrients.energy_kcal).toBe(35)
  })

  it('refuses zero, negative and absurd portions', () => {
    expect(() => savedMealEntries(items, 0)).toThrow()
    expect(() => savedMealEntries(items, -1)).toThrow()
    expect(() => savedMealEntries(items, MAX_SAVED_MEAL_PORTIONS + 1)).toThrow()
    expect(() => savedMealEntries(items, Number.NaN)).toThrow()
  })
})

describe('savedMealInputSchema', () => {
  it('accepts a named meal with ingredients and trims the name', () => {
    const parsed = savedMealInputSchema.parse({ name: '  Overnight oats ', items })
    expect(parsed.name).toBe('Overnight oats')
    expect(parsed.items).toHaveLength(3)
  })

  it('needs a name and at least one ingredient, and caps the ingredients', () => {
    expect(savedMealInputSchema.safeParse({ name: ' ', items }).success).toBe(false)
    expect(savedMealInputSchema.safeParse({ name: 'Empty', items: [] }).success).toBe(false)
    const tooMany = Array.from({ length: MAX_SAVED_MEAL_ITEMS + 1 }, () => banana)
    expect(savedMealInputSchema.safeParse({ name: 'Feast', items: tooMany }).success).toBe(false)
  })

  it('refuses a stray nutrient key and a zero quantity', () => {
    const stray = { ...banana, nutrients: { ...banana.nutrients, caffeine_mg: 1 } }
    expect(savedMealInputSchema.safeParse({ name: 'Bad', items: [stray] }).success).toBe(false)
    const none = { ...banana, quantity: 0 }
    expect(savedMealInputSchema.safeParse({ name: 'Bad', items: [none] }).success).toBe(false)
  })
})

describe('createEntriesRequestSchema with a saved meal', () => {
  const request = {
    day: '2026-10-01',
    meal: 'breakfast',
    loggedAt: '2026-10-01T07:00:00.000Z',
    entries: savedMealEntries(items),
  }

  it('takes the saved meal id when given and does not require it', () => {
    expect(createEntriesRequestSchema.parse(request).savedMealId).toBeUndefined()
    const id = '0199a3f0-0000-7000-8000-00000000000a'
    expect(createEntriesRequestSchema.parse({ ...request, savedMealId: id }).savedMealId).toBe(id)
    expect(createEntriesRequestSchema.safeParse({ ...request, savedMealId: 'nope' }).success).toBe(
      false,
    )
  })
})
