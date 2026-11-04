import { addDays, daysBetween } from '../dates.js'

/**
 * Planned food (D43): an entry the person means to eat but has not eaten yet. It lives on
 * `log_entries` with `planned` set and stays out of `daily_summaries`, so every total, score,
 * streak and review keeps reading what was eaten. Planned has no meal of the day until it is
 * eaten; the row's `meal` is a placeholder nothing shows.
 */

/** How far ahead food can be planned: tomorrow, no further. */
export const MAX_PLAN_DAYS_AHEAD = 1

/**
 * How long a plan outlives its own day: 48 hours from when the day ends, then it is deleted.
 * Counted from the day and not from when the plan was made, so a plan for tomorrow gets as
 * long after its day to be ticked off as a plan for today.
 */
export const PLAN_GRACE_DAYS = 2

/** The furthest day a plan can go on, from the person's local today. */
export function lastPlanDay(today: string): string {
  return addDays(today, MAX_PLAN_DAYS_AHEAD)
}

/** The oldest day that can still hold a plan, from the person's local today. */
export function firstPlanDay(today: string): string {
  return addDays(today, -PLAN_GRACE_DAYS)
}

/** The last day a plan on `day` exists. It is deleted as the next day starts. */
export function planExpiresAfter(day: string): string {
  return addDays(day, PLAN_GRACE_DAYS)
}

/** The days gone by that can still hold a plan, newest first: where Today looks for leftovers. */
export function leftoverPlanDays(today: string): string[] {
  return Array.from({ length: PLAN_GRACE_DAYS }, (_, back) => addDays(today, -(back + 1)))
}

/** A day that has not happened yet can hold a plan and nothing else. */
export function isPlanOnlyDay(day: string, today: string): boolean {
  return day > today
}

/**
 * Why an entry cannot sit on `day`, in words for the person, or null when it can. The API
 * applies this to every write and the picker offers only what passes it. Eaten food can go on
 * any past day. A plan can go back only as far as a plan is kept: one further back would be
 * deleted within the hour.
 */
export function entryDayProblem(day: string, planned: boolean, today: string): string | null {
  if (isPlanOnlyDay(day, today)) {
    if (daysBetween(today, day) > MAX_PLAN_DAYS_AHEAD) return 'You can plan as far as tomorrow.'
    return planned ? null : "That day hasn't happened yet, so it can only be planned."
  }
  return planned && day < firstPlanDay(today) ? 'That day is too far back to plan.' : null
}
