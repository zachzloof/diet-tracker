import {
  roundFoodGroupServes,
  roundNutrientVector,
  scalePortion,
  type SavedMeal,
  type SavedMealItem,
} from '@diet-tracker/shared'
import { snapshotItem, type EditableItem } from '@/features/log/item-edit'

/**
 * A saved meal's ingredients while they are on screen: in the editor, and on the card that
 * logs a meal (where changes are for that one time). Each carries the `base` its portion
 * edits scale from, exactly like an item on the estimate review card (item-edit.ts).
 */
export interface MealDraftItem extends EditableItem {
  /** Stable for the life of the list, for `v-for`. */
  key: number
  name: string
  unit: string
  foodId: string | null
  base: EditableItem
  expanded: boolean
}

let nextKey = 1

export function toDraftItem(item: SavedMealItem): MealDraftItem {
  return {
    key: nextKey++,
    name: item.name,
    unit: item.unit,
    foodId: item.foodId,
    ...snapshotItem(item),
    base: snapshotItem(item),
    expanded: false,
  }
}

const round3 = (value: number) => Math.round(value * 1000) / 1000

/** Back to the wire shape, with float noise from rescaling rounded away. */
export function fromDraftItem(item: MealDraftItem): SavedMealItem {
  return {
    name: item.name,
    quantity: round3(item.quantity),
    unit: item.unit,
    grams: round3(item.grams),
    nutrients: roundNutrientVector(item.nutrients),
    foodGroups: roundFoodGroupServes(item.foodGroups),
    foodId: item.foodId,
  }
}

/**
 * Every ingredient multiplied by `ratio`, for a change in how many portions are being
 * logged. The base moves with the item, so a later edit to one ingredient's amount still
 * rescales from the right numbers, and a correction to one nutrient survives the change.
 */
export function scaleDraftItems(items: readonly MealDraftItem[], ratio: number): MealDraftItem[] {
  return items.map((item) => ({
    ...item,
    ...snapshotItem(scalePortion(item, ratio)),
    base: snapshotItem(scalePortion(item.base, ratio)),
  }))
}

/**
 * The meals that match a search: every word typed must appear in the meal's name or in one
 * of its ingredients, so "oats" finds the porridge and "chicken rice" finds the bowl. The
 * order (most recently logged first) is kept. An empty search matches everything.
 */
export function filterMeals(meals: readonly SavedMeal[], query: string): SavedMeal[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...meals]
  return meals.filter((meal) => {
    const text = [meal.name, ...meal.items.map((item) => item.name)].join(' ').toLowerCase()
    return words.every((word) => text.includes(word))
  })
}

/** "3 ingredients" for the lists. */
export function ingredientCount(count: number): string {
  return `${count} ingredient${count === 1 ? '' : 's'}`
}

/**
 * What one portion of a saved meal weighs: its ingredients' grams added up. 0 when no
 * ingredient carries a weight, in which case the meal cannot be logged by grams.
 */
export function portionGrams(items: readonly { grams: number }[]): number {
  return round3(items.reduce((sum, item) => sum + (item.grams > 0 ? item.grams : 0), 0))
}

/**
 * How many portions a weight of the cooked meal is, for logging a batch by the scale: a
 * 480 g recipe served as 240 g is 0.5 portions. Null when either number is unusable.
 */
export function portionsFromGrams(grams: number | null, perPortion: number): number | null {
  if (grams === null || !(grams > 0) || !(perPortion > 0)) return null
  return round3(grams / perPortion)
}
