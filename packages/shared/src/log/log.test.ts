import { describe, expect, it } from 'vitest'
import { foodEstimateSchema } from '../ai/schemas.js'
import { emptyFoodGroupServes, emptyNutrientVector } from '../nutrition/nutrients.js'
import { inferMeal, suggestDayAndMeal } from './meals.js'
import {
  createEntriesRequestSchema,
  estimateRequestSchema,
  foodInputSchema,
  updateEntryRequestSchema,
} from './schemas.js'

describe('inferMeal', () => {
  it('maps the local hour to a meal', () => {
    expect(inferMeal(7)).toBe('breakfast')
    expect(inferMeal(10)).toBe('breakfast')
    expect(inferMeal(12)).toBe('lunch')
    expect(inferMeal(14)).toBe('lunch')
    expect(inferMeal(15)).toBe('snack')
    expect(inferMeal(19)).toBe('dinner')
    expect(inferMeal(21)).toBe('dinner')
    expect(inferMeal(23)).toBe('snack')
    expect(inferMeal(1)).toBe('snack')
  })
})

describe('suggestDayAndMeal', () => {
  it('uses the local day and offers the previous day before 04:00 local', () => {
    // 01:30 in London on 26 Sep (BST) is 00:30 UTC.
    const late = suggestDayAndMeal(new Date('2026-09-26T00:30:00Z'), 'Europe/London')
    expect(late.day).toBe('2026-09-26')
    expect(late.previousDay).toBe('2026-09-25')
    expect(late.localHour).toBe(1)
    expect(late.meal).toBe('snack')

    const morning = suggestDayAndMeal(new Date('2026-09-26T07:15:00Z'), 'Europe/London')
    expect(morning.day).toBe('2026-09-26')
    expect(morning.previousDay).toBeNull()
    expect(morning.meal).toBe('breakfast')
  })

  it('never derives the day from the server zone', () => {
    const instant = new Date('2026-09-25T23:30:00Z')
    expect(suggestDayAndMeal(instant, 'Australia/Sydney').day).toBe('2026-09-26')
    expect(suggestDayAndMeal(instant, 'America/Los_Angeles').day).toBe('2026-09-25')
  })
})

describe('foodInputSchema', () => {
  const base = {
    name: 'Oats',
    brand: null,
    basis: 'per_100g',
    servingGrams: null,
    servingLabel: null,
    nutrients: emptyNutrientVector(),
    foodGroups: emptyFoodGroupServes(),
  }

  it('accepts a per-100g food without a serving and requires grams for per-serving', () => {
    expect(foodInputSchema.safeParse(base).success).toBe(true)
    const perServing = foodInputSchema.safeParse({ ...base, basis: 'per_serving' })
    expect(perServing.success).toBe(false)
    expect(
      foodInputSchema.safeParse({ ...base, basis: 'per_serving', servingGrams: 35 }).success,
    ).toBe(true)
  })

  it('refuses a stray nutrient key, a negative value and an empty name', () => {
    expect(
      foodInputSchema.safeParse({ ...base, nutrients: { ...base.nutrients, caffeine_mg: 1 } })
        .success,
    ).toBe(false)
    expect(
      foodInputSchema.safeParse({ ...base, nutrients: { ...base.nutrients, protein_g: -1 } })
        .success,
    ).toBe(false)
    expect(foodInputSchema.safeParse({ ...base, name: '  ' }).success).toBe(false)
  })
})

describe('estimateRequestSchema', () => {
  it('trims, requires text and caps it at 500 characters', () => {
    expect(estimateRequestSchema.parse({ text: '  4 eggs ' }).text).toBe('4 eggs')
    expect(estimateRequestSchema.safeParse({ text: '' }).success).toBe(false)
    expect(estimateRequestSchema.safeParse({ text: 'x'.repeat(501) }).success).toBe(false)
  })
})

describe('createEntriesRequestSchema and updateEntryRequestSchema', () => {
  const entry = {
    name: 'Egg, whole, large, boiled',
    quantity: 4,
    unit: 'egg',
    grams: 200,
    nutrients: { ...emptyNutrientVector(), energy_kcal: 300 },
    foodGroups: emptyFoodGroupServes(),
    source: 'ai',
    foodId: null,
    aiCallId: null,
    assumptions: ['assumed large eggs'],
    confidence: 'high',
  }

  it('needs at least one entry and defaults saveToLibrary to false', () => {
    const parsed = createEntriesRequestSchema.parse({
      day: '2026-09-26',
      meal: 'breakfast',
      loggedAt: '2026-09-26T07:00:00.000Z',
      entries: [entry],
    })
    expect(parsed.entries[0]?.saveToLibrary).toBe(false)
    expect(
      createEntriesRequestSchema.safeParse({
        day: '2026-09-26',
        meal: 'breakfast',
        loggedAt: '2026-09-26T07:00:00.000Z',
        entries: [],
      }).success,
    ).toBe(false)
  })

  it('rejects an empty update and accepts a move', () => {
    expect(updateEntryRequestSchema.safeParse({}).success).toBe(false)
    expect(updateEntryRequestSchema.safeParse({ meal: 'lunch', day: '2026-09-25' }).success).toBe(
      true,
    )
  })
})

describe('foodEstimateSchema', () => {
  it('accepts a complete item and refuses a missing nutrient key', () => {
    const item = {
      name: 'Egg, whole, large, boiled',
      input_text: '4 eggs',
      quantity: 4,
      unit: 'egg',
      grams: 200,
      preparation: null,
      assumptions: ['assumed large eggs (50 g each)'],
      confidence: 'high',
      matched_food_id: null,
      nutrients: { ...emptyNutrientVector(), energy_kcal: 310, protein_g: 25 },
      food_groups: { ...emptyFoodGroupServes(), protein_foods: 2 },
    }
    const ok = foodEstimateSchema.safeParse({
      items: [item],
      meal_hint: 'breakfast',
      overall_confidence: 'high',
      clarifying_question: null,
    })
    expect(ok.success).toBe(true)

    const { energy_kcal: _dropped, ...partial } = item.nutrients
    const missing = foodEstimateSchema.safeParse({
      items: [{ ...item, nutrients: partial }],
      meal_hint: null,
      overall_confidence: 'low',
      clarifying_question: null,
    })
    expect(missing.success).toBe(false)
  })
})
