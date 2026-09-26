import {
  addFoodGroupServes,
  addNutrientVectors,
  emptyFoodGroupServes,
  emptyNutrientVector,
  isWaterEntry,
  sumPortions,
  type CreateEntriesRequest,
  type CreateEntriesResponse,
  type DailySummary,
  type DayLogResponse,
  type EstimateRequest,
  type Food,
  type FoodInput,
  type UpdateEntryRequest,
} from '@diet-tracker/shared'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { STATS_KEY } from '@/features/stats/useStats'
import { ApiError } from '@/lib/api'
import { useQueueStore } from '@/stores/queue'
import { foodsApi, logApi } from './api'
import { FOODS_KEY, LOG_KEY, dayKey, foodsKey } from './keys'

export { FOODS_KEY, LOG_KEY, dayKey, foodsKey }

export function dayQueryOptions(day: string) {
  return queryOptions({
    queryKey: dayKey(day),
    queryFn: (): Promise<DayLogResponse> => logApi.day(day),
    staleTime: 60_000,
  })
}

/**
 * One day's entries and totals, with anything queued offline for that day folded in so
 * the log and the ring already count it. Re-runs when `day` changes.
 */
export function useDayLog(day: MaybeRefOrGetter<string>) {
  const queue = useQueueStore()
  const query = useQuery(computed(() => dayQueryOptions(toValue(day))))
  const pending = computed(() => queue.pendingFor(toValue(day)))
  const entries = computed(() => [...(query.data.value?.entries ?? []), ...pending.value])
  const summary = computed<DailySummary | null>(() => {
    const base = query.data.value?.summary ?? null
    if (pending.value.length === 0) return base
    const extra = sumPortions(pending.value)
    const start = base ?? {
      day: toValue(day),
      totals: emptyNutrientVector(),
      foodGroups: emptyFoodGroupServes(),
      entryCount: 0,
    }
    return {
      day: start.day,
      totals: addNutrientVectors(start.totals, extra.totals),
      foodGroups: addFoodGroupServes(start.foodGroups, extra.foodGroups),
      entryCount: start.entryCount + pending.value.filter((e) => !isWaterEntry(e)).length,
    }
  })
  return {
    entries,
    summary,
    pending,
    /** True once the server (or the offline mirror) has answered for this day. */
    hasData: computed(() => query.data.value !== undefined),
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

export interface CreateEntriesResult extends CreateEntriesResponse {
  /** True when the write waits in the offline queue instead of having reached the server. */
  queued: boolean
}

/**
 * Logs entries. Offline, or when the server cannot be reached, the request goes into the
 * queue and the entries show as pending until it is sent (D21).
 */
export function useCreateEntries() {
  const queryClient = useQueryClient()
  const queue = useQueueStore()
  const enqueue = (input: CreateEntriesRequest): CreateEntriesResult => {
    const item = queue.enqueue(input)
    return {
      entries: item.entries,
      summary: {
        day: input.day,
        totals: emptyNutrientVector(),
        foodGroups: emptyFoodGroupServes(),
        entryCount: 0,
      },
      foodsSaved: 0,
      queued: true,
    }
  }
  return useMutation({
    mutationFn: async (input: CreateEntriesRequest): Promise<CreateEntriesResult> => {
      if (!navigator.onLine) return enqueue(input)
      try {
        return { ...(await logApi.createEntries(input)), queued: false }
      } catch (error) {
        if (error instanceof ApiError && error.isNetwork) return enqueue(input)
        throw error
      }
    },
    onSuccess: async (result, input) => {
      if (result.queued) return
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

/** Deletes an entry; a queued one is simply dropped from the queue. */
export function useDeleteEntry() {
  const queryClient = useQueryClient()
  const queue = useQueueStore()
  return useMutation({
    mutationFn: async (id: string) => {
      if (queue.has(id)) {
        queue.removeEntry(id)
        return null
      }
      return logApi.deleteEntry(id)
    },
    onSuccess: (result) => (result ? applySummaries(queryClient, [result.summary]) : undefined),
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
