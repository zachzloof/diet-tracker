import {
  FOOD_GROUP_KEYS,
  NUTRIENT_KEYS,
  rescaleToGrams,
  rescaleToQuantity,
  type FoodGroupServes,
  type NutrientKey,
  type NutrientVector,
} from '@diet-tracker/shared'

/**
 * Editing one item on the review card or in the entry sheet. Two kinds of change, on purpose:
 * - The quantity or the weight: the whole item rescales (3 eggs instead of 4, 150 g of fries
 *   instead of 200 g), always from `base`, the values the item had before the person started
 *   or as of their last nutrient correction, so passing through zero cannot strand it there.
 * - One nutrient: only that number changes. The person is correcting the label, not the
 *   portion. The corrected item becomes the new base, so it scales with later portion edits.
 * The arithmetic itself is the shared `rescaleToQuantity` and `rescaleToGrams` (D15).
 */

export interface EditableItem {
  quantity: number
  grams: number
  nutrients: NutrientVector
  foodGroups: FoodGroupServes
}

export type ItemEdit =
  | { kind: 'quantity'; value: number }
  | { kind: 'grams'; value: number }
  | { kind: 'nutrient'; key: NutrientKey; value: number }

export interface ItemEditResult {
  item: EditableItem
  base: EditableItem
}

/** A plain copy of the four editable fields, detached from any reactive or wider object. */
export function snapshotItem(item: EditableItem): EditableItem {
  return {
    quantity: item.quantity,
    grams: item.grams,
    nutrients: { ...item.nutrients },
    foodGroups: { ...item.foodGroups },
  }
}

export function applyItemEdit(
  base: EditableItem,
  current: EditableItem,
  edit: ItemEdit,
): ItemEditResult {
  switch (edit.kind) {
    case 'quantity':
      return { item: snapshotItem(rescaleToQuantity(base, edit.value)), base }
    case 'grams':
      return { item: snapshotItem(rescaleToGrams(base, edit.value)), base }
    case 'nutrient': {
      const item = snapshotItem(current)
      item.nutrients[edit.key] = edit.value
      return { item, base: item }
    }
  }
}

export function samePortion(a: EditableItem, b: EditableItem): boolean {
  return (
    a.quantity === b.quantity &&
    a.grams === b.grams &&
    NUTRIENT_KEYS.every((key) => a.nutrients[key] === b.nutrients[key]) &&
    FOOD_GROUP_KEYS.every((key) => a.foodGroups[key] === b.foodGroups[key])
  )
}
