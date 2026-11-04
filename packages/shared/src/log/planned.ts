import { addDays, daysBetween } from '../dates.js'

/**
 * Planned food (D43): an entry the person means to eat but has not eaten yet. It lives on
 * `log_entries` with `planned` set and stays out of `daily_summaries`, so every total, score,
 * streak and review keeps reading what was eaten. Planned has no meal of the day until it is
 * eaten; the row's `meal` is a placeholder nothing shows.
 */

/** How far ahead food can be planned: tomorrow, no further. */
export const MAX_PLAN_DAYS_AHEAD = 1

/** The furthest day a plan can go on, from the person's local today. */
export function lastPlanDay(today: string): string {
  return addDays(today, MAX_PLAN_DAYS_AHEAD)
}

/** A day that has not happened yet can hold a plan and nothing else. */
export function isPlanOnlyDay(day: string, today: string): boolean {
  return day > today
}

/**
 * Why an entry cannot sit on `day`, in words for the person, or null when it can. The API
 * applies this to every write and the picker offers only what passes it. Past days stay open
 * in both states: a plan left over from yesterday can still be ticked off or moved.
 */
export function entryDayProblem(day: string, planned: boolean, today: string): string | null {
  if (!isPlanOnlyDay(day, today)) return null
  if (daysBetween(today, day) > MAX_PLAN_DAYS_AHEAD) return 'You can plan as far as tomorrow.'
  return planned ? null : "That day hasn't happened yet, so it can only be planned."
}
