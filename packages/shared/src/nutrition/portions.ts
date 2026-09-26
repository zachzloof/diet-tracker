import type { FoodBasis } from '../log/enums.js'
import {
  FOOD_GROUP_KEYS,
  NUTRIENT_KEYS,
  addFoodGroupServes,
  addNutrientVectors,
  emptyFoodGroupServes,
  emptyNutrientVector,
  scaleFoodGroupServes,
  scaleNutrientVector,
  type FoodGroupServes,
  type NutrientVector,
} from './nutrients.js'

/**
 * Portion math: a library food's values (per 100 g or per serving) scaled to the grams
 * actually eaten, an estimate item rescaled when the person edits its quantity, and the
 * day's totals. Pure; the API and the UI both use these so they can never disagree.
 */

export interface PortionSource {
  basis: FoodBasis
  /** Grams in one serving; required when `basis` is `per_serving`. */
  servingGrams: number | null
  nutrients: NutrientVector
  foodGroups: FoodGroupServes
}

export interface Portion {
  nutrients: NutrientVector
  foodGroups: FoodGroupServes
}

/** The grams the food's stored vector refers to: 100 for per_100g, the serving otherwise. */
export function referenceGrams(food: Pick<PortionSource, 'basis' | 'servingGrams'>): number {
  if (food.basis === 'per_100g') return 100
  if (food.servingGrams === null || food.servingGrams <= 0) {
    throw new Error('A per-serving food needs servingGrams')
  }
  return food.servingGrams
}

/** The food's nutrients and serves for `grams` of it. */
export function portionOf(food: PortionSource, grams: number): Portion {
  if (!Number.isFinite(grams) || grams < 0) throw new Error('grams must be a non-negative number')
  const factor = grams / referenceGrams(food)
  return {
    nutrients: scaleNutrientVector(food.nutrients, factor),
    foodGroups: scaleFoodGroupServes(food.foodGroups, factor),
  }
}

/** Grams for `servings` servings of a food (100 g "servings" for per_100g foods). */
export function gramsForServings(
  food: Pick<PortionSource, 'basis' | 'servingGrams'>,
  servings: number,
): number {
  return referenceGrams(food) * servings
}

export interface Scalable extends Portion {
  quantity: number
  grams: number
}

/** An item rescaled to a new quantity in its own unit (3 eggs instead of 4). */
export function rescaleToQuantity<T extends Scalable>(item: T, quantity: number): T {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error('quantity must be a non-negative number')
  }
  if (item.quantity <= 0) return { ...item, quantity }
  const factor = quantity / item.quantity
  return {
    ...item,
    quantity,
    grams: item.grams * factor,
    nutrients: scaleNutrientVector(item.nutrients, factor),
    foodGroups: scaleFoodGroupServes(item.foodGroups, factor),
  }
}

export interface Totals {
  totals: NutrientVector
  foodGroups: FoodGroupServes
  entryCount: number
}

/** Sums a list of entries. Values are rounded to 3 decimals so JSONB never holds float noise. */
export function sumPortions(entries: readonly Portion[]): Totals {
  let totals = emptyNutrientVector()
  let foodGroups = emptyFoodGroupServes()
  for (const entry of entries) {
    totals = addNutrientVectors(totals, entry.nutrients)
    foodGroups = addFoodGroupServes(foodGroups, entry.foodGroups)
  }
  return {
    totals: roundNutrientVector(totals),
    foodGroups: roundFoodGroupServes(foodGroups),
    entryCount: entries.length,
  }
}

const round3 = (value: number) => Math.round(value * 1000) / 1000

export function roundNutrientVector(v: NutrientVector): NutrientVector {
  const out = emptyNutrientVector()
  for (const key of NUTRIENT_KEYS) out[key] = round3(v[key])
  return out
}

export function roundFoodGroupServes(v: FoodGroupServes): FoodGroupServes {
  const out = emptyFoodGroupServes()
  for (const key of FOOD_GROUP_KEYS) out[key] = round3(v[key])
  return out
}

/** Replaces negative or non-finite values with 0. AI vectors are validated first; this is belt and braces. */
export function sanitiseNutrientVector(v: NutrientVector): NutrientVector {
  const out = emptyNutrientVector()
  for (const key of NUTRIENT_KEYS) out[key] = Number.isFinite(v[key]) && v[key] > 0 ? v[key] : 0
  return out
}

export function sanitiseFoodGroupServes(v: FoodGroupServes): FoodGroupServes {
  const out = emptyFoodGroupServes()
  for (const key of FOOD_GROUP_KEYS) out[key] = Number.isFinite(v[key]) && v[key] > 0 ? v[key] : 0
  return out
}
