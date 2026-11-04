import type { Meal } from '@diet-tracker/shared'

/**
 * Where a confirm puts the food, in the words every way of logging uses: a meal of the day,
 * or Planned (D43), which takes the place of a meal until the food is eaten.
 */

export function slotName(meal: Meal, planned: boolean): string {
  return planned ? 'planned' : meal
}

export function addLabel(meal: Meal, planned: boolean, online: boolean): string {
  const label = `Add to ${slotName(meal, planned)}`
  return online ? label : `${label} (offline)`
}
