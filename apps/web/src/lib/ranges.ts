import { MAX_RANGE_DAYS } from '@diet-tracker/shared'
import type { SegmentOption } from '@/components/ui/SegmentedControl.vue'

/**
 * The time ranges a history screen offers (Progress, the Workouts list, a lift's trend),
 * shortest first. Each value is the window in days, ending today; the longest is the year
 * the app keeps (D27). A screen offers the slice of this list that suits it.
 */
export const HISTORY_RANGES: SegmentOption[] = [
  { value: '28', label: '4 weeks' },
  { value: '90', label: '3 months' },
  { value: '183', label: '6 months' },
  { value: String(MAX_RANGE_DAYS), label: '1 year' },
]

/** The label of a range value ("3 months"), or an empty string for an unknown one. */
export function rangeLabel(value: string): string {
  return HISTORY_RANGES.find((range) => range.value === value)?.label ?? ''
}

/** A range as it reads after "the last": "3 months", "year". */
export function rangeWindow(value: string): string {
  return value === String(MAX_RANGE_DAYS) ? 'year' : rangeLabel(value)
}

/**
 * Range reads longer than this many days stay out of the offline mirror (D21): a year of
 * sessions is hundreds of kilobytes, and the mirror is one localStorage entry rewritten
 * after every change. The three-month default views are still mirrored.
 */
export const MIRRORED_RANGE_DAYS = 92
