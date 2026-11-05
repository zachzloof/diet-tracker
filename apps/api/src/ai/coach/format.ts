import {
  FOOD_GROUPS,
  MEASURE_ORDER,
  NUTRIENTS,
  addDays,
  setMeasureValue,
  type ExerciseMeasure,
  type FoodGroupKey,
  type NutrientKey,
  type SetMetric,
  type TargetKey,
  type WorkoutSet,
} from '@diet-tracker/shared'

/**
 * Number and label formatting shared by the briefing and the tools. Numbers are rounded
 * as the screens round them (ai-coach skill, tools rule 2) so the coach quotes what the
 * person sees: whole kcal and grams on Today and Week, one decimal on kg.
 */

/** One decimal at most, no trailing zero: the weekly review's `fmt`. */
export function fmt(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/** Whole number: the Today tiles and the Week averages. */
export function whole(value: number): number {
  return Math.round(value)
}

export function pct(ratio: number | null): string {
  return ratio === null ? '' : ` (${Math.round(ratio * 100)}%)`
}

export function keyLabel(key: TargetKey): string {
  return key in NUTRIENTS
    ? NUTRIENTS[key as NutrientKey].label
    : FOOD_GROUPS[key as FoodGroupKey].label
}

export function keyUnit(key: TargetKey): string {
  return key in NUTRIENTS ? NUTRIENTS[key as NutrientKey].unitLabel : 'serves'
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function parts(day: string): [number, number, number] {
  return day.split('-').map(Number) as [number, number, number]
}

export function weekdayShort(day: string): string {
  const [y, m, d] = parts(day)
  return WEEKDAYS[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7] ?? ''
}

export function weekdayLong(day: string): string {
  const [y, m, d] = parts(day)
  return WEEKDAYS_LONG[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7] ?? ''
}

/** "Tue 27 Oct". */
export function dayLabel(day: string): string {
  const [, m, d] = parts(day)
  return `${weekdayShort(day)} ${d} ${MONTHS[m - 1]}`
}

/** "today", "yesterday" or "Tue 27 Oct", relative to the person's today. */
export function relativeDayLabel(day: string, today: string): string {
  if (day === today) return 'today'
  if (day === addDays(today, -1)) return 'yesterday'
  if (day === addDays(today, 1)) return 'tomorrow'
  return dayLabel(day)
}

/** "October 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return `${MONTHS_LONG[m - 1]} ${y}`
}

export const METRIC_UNITS: Readonly<Record<SetMetric, string>> = {
  volume: 'kg lifted',
  weight: 'kg',
  reps: 'reps',
  time: 's',
  distance: 'm',
}

export const METRIC_NOTES: Readonly<Record<SetMetric, string>> = {
  volume:
    'kg lifted in one set (weight × reps; a bodyweight exercise adds the bodyweight each rep lifts)',
  weight: 'heaviest weight',
  reps: 'most reps',
  time: 'longest time',
  distance: 'furthest distance',
}

/** "100 kg × 5", "12 reps", "60 s", "2000 m": the set as the session screen writes it. */
export function setText(set: WorkoutSet, measures: readonly ExerciseMeasure[]): string {
  const order = MEASURE_ORDER.filter((measure) => measures.includes(measure))
  const words = order.flatMap((measure) => {
    const value = setMeasureValue(set, measure)
    if (value === null) return []
    switch (measure) {
      case 'weight':
        return [`${fmt(value)} kg`]
      case 'reps':
        return [`${value} reps`]
      case 'time':
        return [`${value} s`]
      case 'distance':
        return [`${fmt(value)} m`]
    }
  })
  if (
    measures.includes('weight') &&
    measures.includes('reps') &&
    set.weightKg !== null &&
    set.reps !== null
  ) {
    return `${fmt(set.weightKg)} kg × ${set.reps}`
  }
  return words.join(', ') || 'empty set'
}

export function metricValueText(value: number, metric: SetMetric): string {
  return `${fmt(value)} ${METRIC_UNITS[metric]}`
}

export function minutesBetween(startedAt: string, endedAt: string | null): number | null {
  if (!endedAt) return null
  return Math.max(
    0,
    Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60_000),
  )
}
