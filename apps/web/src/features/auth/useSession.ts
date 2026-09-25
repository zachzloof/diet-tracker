import type { PublicUser } from '@diet-tracker/shared'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError } from '@/lib/api'
import { authApi } from './api'

export const ME_KEY = ['me'] as const

/**
 * The signed-in user, or null when signed out. A 401 is a normal answer here, not an
 * error; anything else (network, 500) is thrown so screens can show an error state.
 */
export function meQueryOptions() {
  return queryOptions({
    queryKey: ME_KEY,
    queryFn: async (): Promise<PublicUser | null> => {
      try {
        return await authApi.me()
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null
        throw error
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  })
}

export function useSession() {
  const query = useQuery(meQueryOptions())
  return {
    user: computed(() => query.data.value ?? null),
    isLoading: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useLogout() {
  const queryClient = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: authApi.logout,
    onSettled: async () => {
      queryClient.clear()
      queryClient.setQueryData(ME_KEY, null)
      await router.replace({ name: 'login' })
    },
  })
}
