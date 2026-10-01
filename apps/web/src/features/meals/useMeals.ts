import type { SavedMeal, SavedMealInput } from '@diet-tracker/shared'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import { mealsApi } from './api'
import { MEALS_KEY } from './keys'

export { MEALS_KEY }

export function mealsQueryOptions() {
  return queryOptions({
    queryKey: MEALS_KEY,
    queryFn: (): Promise<SavedMeal[]> => mealsApi.list(),
    staleTime: 60_000,
  })
}

/** The person's saved meals, most recently logged first. Mirrored for offline use (D21). */
export function useMeals() {
  const query = useQuery(mealsQueryOptions())
  return {
    meals: computed(() => query.data.value ?? []),
    /** True once the server (or the offline mirror) has answered. */
    hasData: computed(() => query.data.value !== undefined),
    isLoading: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useCreateMeal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SavedMealInput) => mealsApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MEALS_KEY }),
  })
}

export function useUpdateMeal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SavedMealInput }) =>
      mealsApi.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MEALS_KEY }),
  })
}

/** Deleting a meal leaves everything already logged from it as it was. */
export function useDeleteMeal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => mealsApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MEALS_KEY }),
  })
}
