import {
  roundFoodGroupServes,
  roundNutrientVector,
  scalePortion,
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

/** "3 ingredients" for the lists. */
export function ingredientCount(count: number): string {
  return `${count} ingredient${count === 1 ? '' : 's'}`
}
