import { z } from 'zod'

/**
 * Enums shared by food logging, the foods library and the AI estimate schema. Stored as
 * text in Postgres and validated here, so adding a value is a code change only.
 */

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const
export const mealSchema = z.enum(MEALS)
export type Meal = z.infer<typeof mealSchema>

export const MEAL_LABELS: Readonly<Record<Meal, string>> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

/** How sure the estimator is about one item. The review card colours it. */
export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const
export const confidenceSchema = z.enum(CONFIDENCE_LEVELS)
export type Confidence = z.infer<typeof confidenceSchema>

export const CONFIDENCE_LABELS: Readonly<Record<Confidence, string>> = {
  high: 'Confident',
  medium: 'Rough',
  low: 'Guess',
}

/** What a library food's nutrient vector refers to. */
export const FOOD_BASES = ['per_100g', 'per_serving'] as const
export const foodBasisSchema = z.enum(FOOD_BASES)
export type FoodBasis = z.infer<typeof foodBasisSchema>

/** Where a library food's values came from. `usda` is reserved for a later resolver (D5 option B). */
export const FOOD_SOURCES = ['manual', 'ai', 'usda'] as const
export const foodSourceSchema = z.enum(FOOD_SOURCES)
export type FoodSource = z.infer<typeof foodSourceSchema>

/** How a log entry was created. `library` entries made no AI call. */
export const ENTRY_SOURCES = ['ai', 'manual', 'library'] as const
export const entrySourceSchema = z.enum(ENTRY_SOURCES)
export type EntrySource = z.infer<typeof entrySourceSchema>
