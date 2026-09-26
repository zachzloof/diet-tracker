import {
  evaluateDay,
  type DailySummary,
  type DayScore,
  type TargetVersion,
} from '@diet-tracker/shared'
import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'

/**
 * The live day score on Today: the same `evaluateDay` the API runs for weekly stats, over
 * the cached summary and the current targets, so the two screens can never disagree.
 */
export function useDayScore(
  summary: MaybeRefOrGetter<DailySummary | null>,
  version: MaybeRefOrGetter<TargetVersion | null>,
): ComputedRef<DayScore | null> {
  return computed(() => {
    const s = toValue(summary)
    const v = toValue(version)
    if (!s || !v) return null
    return evaluateDay(
      { totals: s.totals, foodGroups: s.foodGroups, entryCount: s.entryCount },
      v.effective,
    )
  })
}
