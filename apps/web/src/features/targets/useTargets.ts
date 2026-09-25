import type { OverridesInput, TargetHistoryItem, TargetVersion } from '@diet-tracker/shared'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import { targetsApi } from '@/features/profile/api'

export const TARGETS_KEY = ['targets'] as const
export const TARGETS_HISTORY_KEY = ['targets', 'history'] as const

export function targetsQueryOptions() {
  return queryOptions({
    queryKey: TARGETS_KEY,
    queryFn: (): Promise<TargetVersion> => targetsApi.current(),
    staleTime: 5 * 60_000,
  })
}

export function useTargets() {
  const query = useQuery(targetsQueryOptions())
  return {
    version: computed(() => query.data.value ?? null),
    isLoading: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useTargetsHistory() {
  const query = useQuery(
    queryOptions({
      queryKey: TARGETS_HISTORY_KEY,
      queryFn: (): Promise<TargetHistoryItem[]> => targetsApi.history(),
      staleTime: 60_000,
    }),
  )
  return {
    versions: computed(() => query.data.value ?? []),
    isLoading: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

/** Applies an override patch; the returned version replaces the cached one. */
export function useSetOverrides() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: OverridesInput) => targetsApi.overrides(input),
    onSuccess: async (result) => {
      queryClient.setQueryData(TARGETS_KEY, result.version)
      await queryClient.invalidateQueries({ queryKey: TARGETS_HISTORY_KEY })
    },
  })
}

/** Fetches (or generates) the AI explanation and stores it on the cached version. */
export function useExplainPlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (force?: boolean) => targetsApi.explain(force ?? false),
    onSuccess: (result) => {
      queryClient.setQueryData(TARGETS_KEY, (current: TargetVersion | undefined) =>
        current ? { ...current, explanation: result.explanation } : current,
      )
    },
  })
}
