import type { Exercise, ExerciseInput, Workout } from '@diet-tracker/shared'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { exercisesApi, workoutsApi } from './api'
import {
  EXERCISES_KEY,
  WORKOUTS_KEY,
  exerciseHistoryKey,
  workoutKey,
  workoutsRangeKey,
} from './keys'

export { EXERCISES_KEY, WORKOUTS_KEY }

export function exercisesQueryOptions() {
  return queryOptions({
    queryKey: EXERCISES_KEY,
    queryFn: (): Promise<Exercise[]> => exercisesApi.list(),
    staleTime: 60_000,
  })
}

/** The catalogue plus the person's own, most recently used first. Mirrored offline (D21). */
export function useExercises() {
  const query = useQuery(exercisesQueryOptions())
  return {
    exercises: computed(() => query.data.value ?? []),
    hasData: computed(() => query.data.value !== undefined),
    isLoading: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useCreateExercise() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ExerciseInput) => exercisesApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EXERCISES_KEY }),
  })
}

export function useDeleteExercise() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => exercisesApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: EXERCISES_KEY })
      void queryClient.invalidateQueries({ queryKey: WORKOUTS_KEY })
    },
  })
}

/** The last session with this exercise, for the "last time" numbers on each set row. */
export function useExerciseHistory(exerciseId: MaybeRefOrGetter<string | null>, limit = 1) {
  const query = useQuery(
    computed(() => {
      const id = toValue(exerciseId)
      return {
        queryKey: exerciseHistoryKey(id ?? 'none', limit),
        queryFn: () => (id ? exercisesApi.history(id, limit) : Promise.resolve([])),
        enabled: id !== null,
        staleTime: 5 * 60_000,
      }
    }),
  )
  return {
    history: computed(() => query.data.value ?? []),
    last: computed(() => query.data.value?.[0] ?? null),
  }
}

export function workoutsRangeQueryOptions(from: string, to: string) {
  return queryOptions({
    queryKey: workoutsRangeKey(from, to),
    queryFn: (): Promise<Workout[]> => workoutsApi.list(from, to),
    staleTime: 60_000,
  })
}

/** Sessions between two user-local days inclusive, newest first. */
export function useWorkouts(from: MaybeRefOrGetter<string>, to: MaybeRefOrGetter<string>) {
  const query = useQuery(computed(() => workoutsRangeQueryOptions(toValue(from), toValue(to))))
  return {
    workouts: computed(() => query.data.value ?? []),
    hasData: computed(() => query.data.value !== undefined),
    isLoading: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

export function workoutQueryOptions(id: string) {
  return queryOptions({
    queryKey: workoutKey(id),
    queryFn: (): Promise<Workout> => workoutsApi.get(id),
    staleTime: 60_000,
  })
}

/** Fetches a session; pass `enabled` false while a local draft already holds it. */
export function useWorkout(
  id: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean> = true,
) {
  const query = useQuery(
    computed(() => ({ ...workoutQueryOptions(toValue(id)), enabled: toValue(enabled) })),
  )
  return {
    workout: computed(() => query.data.value ?? null),
    isLoading: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useDeleteWorkout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => workoutsApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: WORKOUTS_KEY })
      void queryClient.invalidateQueries({ queryKey: EXERCISES_KEY })
    },
  })
}
