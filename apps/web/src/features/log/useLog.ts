import type {
  CreateEntriesRequest,
  DailySummary,
  DayLogResponse,
  EstimateRequest,
  Food,
  FoodInput,
  UpdateEntryRequest,
} from '@diet-tracker/shared'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { STATS_KEY } from '@/features/stats/useStats'
import { foodsApi, logApi } from './api'

export const LOG_KEY = ['log'] as const
export const dayKey = (day: string) => ['log', 'day', day] as const
export const FOODS_KEY = ['foods'] as const
export const foodsKey = (q: string) => ['foods', q] as const

export function dayQueryOptions(day: string) {
  return queryOptions({
    queryKey: dayKey(day),
    queryFn: (): Promise<DayLogResponse> => logApi.day(day),
    staleTime: 60_000,
  })
}

/** One day's entries and totals. Re-runs when `day` changes. */
export function useDayLog(day: MaybeRefOrGetter<string>) {
  const query = useQuery(computed(() => dayQueryOptions(toValue(day))))
  return {
    entries: computed(() => query.data.value?.entries ?? []),
    summary: computed(() => query.data.value?.summary ?? null),
    isLoading: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

/** Drops the cached summary for `day` straight into place and refetches the entries. */
function applySummaries(
  queryClient: ReturnType<typeof useQueryClient>,
  summaries: DailySummary[],
): Promise<unknown> {
  for (const summary of summaries) {
    queryClient.setQueryData(dayKey(summary.day), (current: DayLogResponse | undefined) =>
      current ? { ...current, summary } : current,
    )
  }
  return Promise.all([
    ...summaries.map((summary) => queryClient.invalidateQueries({ queryKey: dayKey(summary.day) })),
    queryClient.invalidateQueries({ queryKey: STATS_KEY }),
  ])
}

export function useCreateEntries() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateEntriesRequest) => logApi.createEntries(input),
    onSuccess: async (result, input) => {
      queryClient.setQueryData(dayKey(input.day), (current: DayLogResponse | undefined) =>
        current
          ? {
              ...current,
              entries: [...current.entries, ...result.entries],
              summary: result.summary,
            }
          : current,
      )
      await queryClient.invalidateQueries({ queryKey: dayKey(input.day) })
      await queryClient.invalidateQueries({ queryKey: STATS_KEY })
      if (result.foodsSaved > 0 || input.entries.some((e) => e.foodId)) {
        await queryClient.invalidateQueries({ queryKey: FOODS_KEY })
      }
    },
  })
}

export function useUpdateEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateEntryRequest }) =>
      logApi.updateEntry(id, patch),
    onSuccess: (result) => applySummaries(queryClient, result.summaries),
  })
}

export function useDeleteEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => logApi.deleteEntry(id),
    onSuccess: (result) => applySummaries(queryClient, [result.summary]),
  })
}

export function useEstimate() {
  return useMutation({
    mutationFn: (input: EstimateRequest) => logApi.estimate(input),
  })
}

/** The foods library, filtered by `q` (server-side, name or brand). */
export function useFoods(q: MaybeRefOrGetter<string>) {
  const query = useQuery(
    computed(() =>
      queryOptions({
        queryKey: foodsKey(toValue(q).trim()),
        queryFn: (): Promise<Food[]> => foodsApi.list(toValue(q).trim()),
        staleTime: 60_000,
        placeholderData: (previous) => previous,
      }),
    ),
  )
  return {
    foods: computed(() => query.data.value ?? []),
    isLoading: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useCreateFood() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: FoodInput) => foodsApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FOODS_KEY }),
  })
}

export function useUpdateFood() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: FoodInput }) => foodsApi.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FOODS_KEY }),
  })
}

export function useDeleteFood() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => foodsApi.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: FOODS_KEY })
      // Entries linked to the food keep their snapshot but lose the link.
      await queryClient.invalidateQueries({ queryKey: LOG_KEY })
    },
  })
}
