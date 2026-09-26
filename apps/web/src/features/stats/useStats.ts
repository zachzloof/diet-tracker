import type {
  MonthStatsResponse,
  WeekStatsResponse,
  WeeklyReviewResponse,
} from '@diet-tracker/shared'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { statsApi } from './api'

/** Every stats query hangs off this key so a log write can drop them all at once. */
export const STATS_KEY = ['stats'] as const
export const weekKey = (end: string) => ['stats', 'week', end] as const
export const monthKey = (month: string) => ['stats', 'month', month] as const
export const reviewKey = (end: string) => ['stats', 'review', end] as const

export function weekQueryOptions(end: string) {
  return queryOptions({
    queryKey: weekKey(end),
    queryFn: (): Promise<WeekStatsResponse> => statsApi.week(end),
    staleTime: 60_000,
  })
}

/** Seven scored days ending on `end`, with the streak and the gaps. */
export function useWeekStats(end: MaybeRefOrGetter<string>) {
  const query = useQuery(
    computed(() => ({
      ...weekQueryOptions(toValue(end)),
      placeholderData: (previous: WeekStatsResponse | undefined) => previous,
    })),
  )
  return {
    stats: computed(() => query.data.value ?? null),
    isLoading: query.isPending,
    isPlaceholder: query.isPlaceholderData,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useMonthStats(month: MaybeRefOrGetter<string>) {
  const query = useQuery(
    computed(() =>
      queryOptions({
        queryKey: monthKey(toValue(month)),
        queryFn: (): Promise<MonthStatsResponse> => statsApi.month(toValue(month)),
        staleTime: 60_000,
        placeholderData: (previous) => previous,
      }),
    ),
  )
  return {
    stats: computed(() => query.data.value ?? null),
    isLoading: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * The AI weekly review for the window ending on `end`. Runs only once `enabled` (the week
 * stats have loaded with enough days) so it never blocks the screen's first paint.
 */
export function useWeeklyReview(end: MaybeRefOrGetter<string>, enabled: MaybeRefOrGetter<boolean>) {
  const query = useQuery(
    computed(() =>
      queryOptions({
        queryKey: reviewKey(toValue(end)),
        queryFn: (): Promise<WeeklyReviewResponse> => statsApi.weeklyReview(toValue(end)),
        enabled: toValue(enabled),
        staleTime: 10 * 60_000,
        retry: false,
      }),
    ),
  )
  return {
    response: computed(() => query.data.value ?? null),
    isLoading: computed(() => query.isPending.value && query.fetchStatus.value === 'fetching'),
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

/** "Write it again": regenerates and replaces the cached review for that window. */
export function useRegenerateReview() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (end: string) => statsApi.weeklyReview(end, true),
    onSuccess: (result, end) => {
      queryClient.setQueryData(reviewKey(end), result)
    },
  })
}
