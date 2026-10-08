import {
  DEFAULT_PREFERENCES,
  type Preferences,
  type PreferencesPatch,
  type Profile,
} from '@diet-tracker/shared'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, type ComputedRef } from 'vue'
import { STATS_KEY } from '@/features/stats/useStats'
import { profileApi } from './api'
import { PROFILE_KEY, useProfile } from './useProfile'

/**
 * Display preferences (D37) read off the cached profile, so they answer offline and
 * before onboarding (everything on). Screens hide cards with these; nothing is recomputed.
 */
export function usePreferences(): ComputedRef<Preferences> {
  const { profile } = useProfile()
  return computed(() => profile.value?.preferences ?? DEFAULT_PREFERENCES)
}

/** Saves a change and drops it straight into the cached profile; week stats refetch (gaps). */
export function useSavePreferences() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: PreferencesPatch) => profileApi.updatePreferences(patch),
    onSuccess: async (preferences) => {
      queryClient.setQueryData<Profile | null>(PROFILE_KEY, (current) =>
        current ? { ...current, preferences } : current,
      )
      await queryClient.invalidateQueries({ queryKey: STATS_KEY })
    },
  })
}
