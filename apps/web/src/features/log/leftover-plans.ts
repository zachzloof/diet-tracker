import { addDays, type LogEntry } from '@diet-tracker/shared'
import { weekdayLong } from '@/lib/format'
import { groupEntries } from './day-groups'

export interface LeftoverNotice {
  /** The day the line opens: the oldest one with a plan left, because it clears first. */
  day: string
  text: string
}

/**
 * The line on Today for plans left unticked on days gone by (D43), or null when there are none.
 * A saved meal is one plan, as it is one row in the list.
 */
export function leftoverNotice(
  days: readonly { day: string; entries: readonly LogEntry[] }[],
  today: string,
): LeftoverNotice | null {
  const left = days
    .map(({ day, entries }) => ({
      day,
      plans: groupEntries(entries.filter((entry) => entry.planned)).length,
    }))
    .filter(({ plans }) => plans > 0)
    .sort((a, b) => a.day.localeCompare(b.day))
  const oldest = left[0]
  if (!oldest) return null

  const count = left.reduce((sum, { plans }) => sum + plans, 0)
  const from =
    left.length > 1
      ? 'earlier'
      : oldest.day === addDays(today, -1)
        ? 'yesterday'
        : weekdayLong(oldest.day)
  return {
    day: oldest.day,
    text: `${count} ${count === 1 ? 'plan' : 'plans'} from ${from} not ticked`,
  }
}
