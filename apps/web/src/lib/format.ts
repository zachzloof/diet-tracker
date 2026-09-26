import {
  FOOD_GROUPS,
  NUTRIENTS,
  kgToLb,
  type FoodGroupKey,
  type NutrientKey,
  type TargetEntry,
  type TargetKey,
  type TargetUnit,
  type UnitSystem,
} from '@diet-tracker/shared'

/** Display helpers. Storage is always metric; these only touch what is shown. */

export function formatNumber(value: number, maxDecimals = 1): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: maxDecimals })
}

export function unitLabel(unit: TargetUnit, key?: TargetKey): string {
  if (unit === 'serves') return 'serves'
  if (key && key in NUTRIENTS) return NUTRIENTS[key as NutrientKey].unitLabel
  return unit
}

export function targetLabel(key: TargetKey): string {
  return key in NUTRIENTS
    ? NUTRIENTS[key as NutrientKey].label
    : FOOD_GROUPS[key as FoodGroupKey].label
}

export function formatTarget(entry: TargetEntry): string {
  return `${formatNumber(entry.value)} ${unitLabel(entry.unit, entry.key)}`
}

export const KIND_LABELS = {
  goal: 'Aim for',
  minimum: 'At least',
  limit: 'At most',
  info: 'Info',
} as const

export function formatWeight(kg: number, units: UnitSystem): string {
  return units === 'imperial' ? `${formatNumber(kgToLb(kg), 1)} lb` : `${formatNumber(kg, 1)} kg`
}

export function formatDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  if (!y || !m || !d) return day
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatInstant(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** "4 eggs", "1.5 cups", "50 g": whole numbers stay whole, fractions get one or two decimals. */
export function formatQuantity(quantity: number, unit: string): string {
  const q = Number.isInteger(quantity)
    ? String(quantity)
    : quantity.toFixed(quantity < 1 ? 2 : 1).replace(/\.?0+$/, '')
  return unit === 'g' || unit === 'ml' ? `${q} ${unit}` : `${q} ${unit}`
}

export function formatKcal(kcal: number): string {
  return `${formatNumber(Math.round(kcal), 0)} kcal`
}

/** Grams to one decimal, dropping the decimal when whole. */
export function formatGrams(grams: number): string {
  return `${formatNumber(Math.round(grams * 10) / 10, 1)} g`
}

export function formatMealTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
