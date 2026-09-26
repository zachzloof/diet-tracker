import { addDays, localDay, localTimeParts } from '../dates.js'
import type { Meal } from './enums.js'

/**
 * Which meal an entry most likely belongs to, and which day. Pure: the caller passes the
 * instant and the user's time zone. Both are suggestions the person can change.
 */

/** Entries before this local hour may belong to the previous day (a late dinner, a night shift). */
export const LATE_NIGHT_CUTOFF_HOUR = 4

/** Meal by local wall-clock hour: breakfast 4 to 10, lunch 11 to 14, dinner 17 to 21, else snack. */
export function inferMeal(hour: number): Meal {
  if (hour >= 4 && hour < 11) return 'breakfast'
  if (hour >= 11 && hour < 15) return 'lunch'
  if (hour >= 17 && hour < 22) return 'dinner'
  return 'snack'
}

export interface DaySuggestion {
  /** The user's local calendar day at `instant`. */
  day: string
  /** Offered with one tap when it is before the late-night cutoff; otherwise null. */
  previousDay: string | null
  localHour: number
  meal: Meal
}

export function suggestDayAndMeal(instant: Date, timeZone: string): DaySuggestion {
  const day = localDay(instant, timeZone)
  const { hour } = localTimeParts(instant, timeZone)
  return {
    day,
    previousDay: hour < LATE_NIGHT_CUTOFF_HOUR ? addDays(day, -1) : null,
    localHour: hour,
    meal: inferMeal(hour),
  }
}
