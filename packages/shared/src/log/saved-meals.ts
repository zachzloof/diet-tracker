import {
  roundFoodGroupServes,
  roundNutrientVector,
  scalePortion,
  sumPortions,
  type Totals,
} from '../nutrition/portions.js'
import type { LogEntryInput, SavedMealItem } from './schemas.js'

/**
 * Saved meals: a named list of ingredients a person eats together often, logged in one go.
 * "Meal" on its own already means breakfast, lunch, dinner or snack (enums.ts), so the
 * preset is a `SavedMeal` everywhere in code; the screens call it a meal.
 */

/** How many portions of a saved meal can be logged at once; keeps a typo from logging 100. */
export const MAX_SAVED_MEAL_PORTIONS = 20

const round3 = (value: number) => Math.round(value * 1000) / 1000

/** What one portion of the meal adds up to. */
export function savedMealTotals(items: readonly SavedMealItem[]): Totals {
  return sumPortions(items)
}

/**
 * The log entries for `portions` portions of a meal, one per ingredient. An ingredient still
 * linked to a library food is logged as coming from the library, so the food's "last used"
 * moves with it; the rest are manual entries. No AI call is involved.
 */
export function savedMealEntries(items: readonly SavedMealItem[], portions = 1): LogEntryInput[] {
  if (!Number.isFinite(portions) || portions <= 0 || portions > MAX_SAVED_MEAL_PORTIONS) {
    throw new Error(`portions must be above 0 and at most ${MAX_SAVED_MEAL_PORTIONS}`)
  }
  return items.map((item) => {
    const scaled = scalePortion(item, portions)
    return {
      name: item.name,
      quantity: round3(scaled.quantity),
      unit: item.unit,
      grams: round3(scaled.grams),
      nutrients: roundNutrientVector(scaled.nutrients),
      foodGroups: roundFoodGroupServes(scaled.foodGroups),
      source: item.foodId ? 'library' : 'manual',
      foodId: item.foodId,
      aiCallId: null,
      assumptions: [],
      confidence: null,
      brand: null,
      saveToLibrary: false,
    }
  })
}
