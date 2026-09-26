import type {
  RecalibrationAssessment,
  UpsertWeightRequest,
  WeightsResponse,
} from '@diet-tracker/shared'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { PROFILE_KEY } from '@/features/profile/useProfile'
import { STATS_KEY } from '@/features/stats/useStats'
import { TARGETS_HISTORY_KEY, TARGETS_KEY } from '@/features/targets/useTargets'
import { recalibrationApi, weightApi } from './api'

export const WEIGHT_KEY = ['weight'] as const
export const weightKey = (days: number) => ['weight', days] as const
export const RECALIBRATION_KEY = ['recalibration'] as const

export function weightQueryOptions(days: number) {
  return queryOptions({
    queryKey: weightKey(days),
    queryFn: (): Promise<WeightsResponse> => weightApi.list(days),
    staleTime: 60_000,
  })
}

/** Weigh-ins for the last `days` days with the goal weight and the expected pace. */
export function useWeights(days: MaybeRefOrGetter<number>) {
  const query = useQuery(
    computed(() => ({
      ...weightQueryOptions(toValue(days)),
      placeholderData: (previous: WeightsResponse | undefined) => previous,
    })),
  )
  return {
    data: computed(() => query.data.value ?? null),
    isLoading: query.isPending,
    isPlaceholder: query.isPlaceholderData,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useUpsertWeight() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpsertWeightRequest) => weightApi.upsert(input),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: WEIGHT_KEY })
      await queryClient.invalidateQueries({ queryKey: RECALIBRATION_KEY })
      if (result.profileWeightUpdated) {
        await queryClient.invalidateQueries({ queryKey: PROFILE_KEY })
      }
    },
  })
}

export function useDeleteWeight() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (day: string) => weightApi.remove(day),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: WEIGHT_KEY })
      await queryClient.invalidateQueries({ queryKey: RECALIBRATION_KEY })
    },
  })
}

export function recalibrationQueryOptions() {
  return queryOptions({
    queryKey: RECALIBRATION_KEY,
    queryFn: (): Promise<RecalibrationAssessment> => recalibrationApi.assess(),
    staleTime: 5 * 60_000,
  })
}

/** Where the plan stands: not due, needs data, on track, or a proposal to confirm. */
export function useRecalibration(enabled: MaybeRefOrGetter<boolean> = true) {
  const query = useQuery(
    computed(() => ({ ...recalibrationQueryOptions(), enabled: toValue(enabled) })),
  )
  return {
    assessment: computed(() => query.data.value ?? null),
    isLoading: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useApplyRecalibration() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (expectedEnergyKcal: number) => recalibrationApi.apply(expectedEnergyKcal),
    onSuccess: async (result) => {
      queryClient.setQueryData(TARGETS_KEY, result.version)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: TARGETS_HISTORY_KEY }),
        queryClient.invalidateQueries({ queryKey: RECALIBRATION_KEY }),
        queryClient.invalidateQueries({ queryKey: PROFILE_KEY }),
        queryClient.invalidateQueries({ queryKey: STATS_KEY }),
      ])
    },
  })
}

export function useSnoozeRecalibration() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => recalibrationApi.snooze(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RECALIBRATION_KEY }),
  })
}
