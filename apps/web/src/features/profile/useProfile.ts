import type { Profile, ProfileInput } from '@diet-tracker/shared'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import { TARGETS_HISTORY_KEY, TARGETS_KEY } from '@/features/targets/useTargets'
import { ApiError } from '@/lib/api'
import { profileApi } from './api'

export const PROFILE_KEY = ['profile'] as const

/** The saved profile, or null before onboarding. Cached for the session; saving updates it. */
export function profileQueryOptions() {
  return queryOptions({
    queryKey: PROFILE_KEY,
    queryFn: (): Promise<Profile | null> => profileApi.get(),
    staleTime: 5 * 60_000,
    // Signed out, this answers 401; the router guard handles that, so a retry only costs time.
    retry: (count, error) => !(error instanceof ApiError && error.status === 401) && count < 1,
  })
}

export function useProfile() {
  const query = useQuery(profileQueryOptions())
  return {
    profile: computed(() => query.data.value ?? null),
    isLoading: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

/** Saves the profile and drops the new targets straight into the cache. */
export function useSaveProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ProfileInput) => profileApi.save(input),
    onSuccess: async (result) => {
      queryClient.setQueryData(PROFILE_KEY, result.profile)
      queryClient.setQueryData(TARGETS_KEY, result.version)
      await queryClient.invalidateQueries({ queryKey: TARGETS_HISTORY_KEY })
    },
  })
}
