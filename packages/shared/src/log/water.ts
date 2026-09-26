import {
  emptyFoodGroupServes,
  emptyNutrientVector,
  type NutrientVector,
} from '../nutrition/nutrients.js'
import type { LogEntryInput } from './schemas.js'

/**
 * Water quick-adds are ordinary log entries (decision D18): a "Water" entry of N ml whose
 * only nutrient is `water_ml`. The daily summary sums them like any nutrient; the day log
 * folds them into one row; they do not count toward the "unlogged day" entry count.
 */

export const WATER_ENTRY_NAME = 'Water'
export const WATER_ENTRY_UNIT = 'ml'
export const WATER_QUICK_ADD_ML = 250

export interface WaterLike {
  name: string
  unit: string
  nutrients: NutrientVector
}

export function isWaterEntry(entry: WaterLike): boolean {
  return (
    entry.name === WATER_ENTRY_NAME &&
    entry.unit === WATER_ENTRY_UNIT &&
    entry.nutrients.energy_kcal === 0 &&
    entry.nutrients.water_ml > 0
  )
}

export function waterEntryInput(ml: number = WATER_QUICK_ADD_ML): LogEntryInput {
  return {
    name: WATER_ENTRY_NAME,
    quantity: ml,
    unit: WATER_ENTRY_UNIT,
    grams: ml,
    nutrients: { ...emptyNutrientVector(), water_ml: ml },
    foodGroups: emptyFoodGroupServes(),
    source: 'manual',
    foodId: null,
    aiCallId: null,
    assumptions: [],
    confidence: null,
    brand: null,
    saveToLibrary: false,
  }
}
