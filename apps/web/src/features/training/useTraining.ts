import {
  MAX_EXERCISE_HISTORY_SESSIONS,
  daysBetween,
  type Exercise,
  type ExerciseHistoryEntry,
  type ExerciseInput,
  type Workout,
} from '@diet-tracker/shared'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { exercisesApi, workoutsApi } from './api'
import {
  EXERCISES_KEY,
  WORKOUTS_KEY,
  exerciseHistoryKey,
  exerciseTrendKey,
  workoutKey,
  workoutsRangeKey,
} from './keys'
import { MIRRORED_RANGE_DAYS } from '@/lib/ranges'
import { COACH_BRIEF_KEY } from '@/stores/coach'

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
    isLoading: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

/** Whether a `from`..`to` read is short enough for the offline mirror (D21). */
const mirrored = (from: string, to: string) => daysBetween(from, to) < MIRRORED_RANGE_DAYS

/**
 * Every session with this exercise from `from` to today, newest first: a lift's trend over
 * a range of up to a year. `to` keys the read to the day it was made and decides whether
 * it is short enough for the offline mirror.
 */
export function useExerciseTrend(
  exerciseId: MaybeRefOrGetter<string>,
  from: MaybeRefOrGetter<string>,
  to: MaybeRefOrGetter<string>,
) {
  const query = useQuery(
    computed(() => {
      const id = toValue(exerciseId)
      const start = toValue(from)
      const end = toValue(to)
      return {
        queryKey: exerciseTrendKey(id, start, end),
        queryFn: () => exercisesApi.history(id, MAX_EXERCISE_HISTORY_SESSIONS, start),
        enabled: id !== '',
        staleTime: 5 * 60_000,
        meta: { mirror: mirrored(start, end) },
        // Keep the last range on screen while a longer one loads, never another lift's.
        placeholderData: (
          previous: ExerciseHistoryEntry[] | undefined,
          previousQuery: { queryKey: readonly unknown[] } | undefined,
        ) => (previousQuery?.queryKey[2] === id ? previous : undefined),
      }
    }),
  )
  return {
    history: computed(() => query.data.value ?? []),
    isLoading: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

export function workoutsRangeQueryOptions(from: string, to: string) {
  return queryOptions({
    queryKey: workoutsRangeKey(from, to),
    queryFn: (): Promise<Workout[]> => workoutsApi.list(from, to),
    staleTime: 60_000,
    meta: { mirror: mirrored(from, to) },
  })
}

/**
 * Sessions between two user-local days inclusive, newest first. `keepPrevious` holds the
 * last range on screen while a new one loads (the Workouts list's range control).
 */
export function useWorkouts(
  from: MaybeRefOrGetter<string>,
  to: MaybeRefOrGetter<string>,
  keepPrevious = false,
) {
  const query = useQuery(
    computed(() => ({
      ...workoutsRangeQueryOptions(toValue(from), toValue(to)),
      placeholderData: keepPrevious ? (previous: Workout[] | undefined) => previous : undefined,
    })),
  )
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
      void queryClient.invalidateQueries({ queryKey: COACH_BRIEF_KEY })
    },
  })
}
