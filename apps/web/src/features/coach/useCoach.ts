import type {
  AiCostsResponse,
  CoachBrief,
  CoachBriefHalf,
  CoachNote,
  CoachThread,
  CoachThreadResponse,
} from '@diet-tracker/shared'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { COACH_NOTES_KEY, COACH_THREADS_KEY, coachBriefKey, coachThreadKey } from '@/stores/coach'
import { coachApi } from './api'

export function threadsQueryOptions() {
  return queryOptions({
    queryKey: COACH_THREADS_KEY,
    queryFn: (): Promise<CoachThread[]> => coachApi.threads(),
    staleTime: 30_000,
  })
}

/** Recent chats, most recently active first. */
export function useCoachThreads() {
  const query = useQuery(threadsQueryOptions())
  return {
    threads: computed(() => query.data.value ?? []),
    hasData: computed(() => query.data.value !== undefined),
    isLoading: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

export function threadQueryOptions(id: string) {
  return queryOptions({
    queryKey: coachThreadKey(id),
    queryFn: (): Promise<CoachThreadResponse> => coachApi.get(id),
    staleTime: 60_000,
  })
}

/** One chat with its messages; `enabled` false while there is no thread yet. */
export function useCoachThread(id: MaybeRefOrGetter<string | null>) {
  const query = useQuery(
    computed(() => {
      const value = toValue(id)
      return {
        ...threadQueryOptions(value ?? 'none'),
        enabled: value !== null,
      }
    }),
  )
  return {
    thread: computed(() => query.data.value?.thread ?? null),
    messages: computed(() => query.data.value?.messages ?? []),
    hasData: computed(() => query.data.value !== undefined),
    isLoading: computed(() => query.isPending.value && query.fetchStatus.value === 'fetching'),
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

/** The lines the person asked the coach to remember, newest first. */
export function useCoachNotes() {
  const query = useQuery(
    queryOptions({
      queryKey: COACH_NOTES_KEY,
      queryFn: (): Promise<CoachNote[]> => coachApi.notes(),
      staleTime: 60_000,
    }),
  )
  return {
    notes: computed(() => query.data.value ?? []),
    hasData: computed(() => query.data.value !== undefined),
    isLoading: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useCreateNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (text: string) => coachApi.createNote(text),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: COACH_NOTES_KEY }),
  })
}

export function useDeleteNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => coachApi.removeNote(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: COACH_NOTES_KEY }),
  })
}

export function useDeleteThread() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => coachApi.remove(id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: coachThreadKey(id) })
      return queryClient.invalidateQueries({ queryKey: COACH_THREADS_KEY })
    },
  })
}

/**
 * Today's one-line brief for a half (slice 11c). The server builds it from the current
 * numbers on every call (no model), and the key is dropped by log and session writes, so
 * the line moves with the day. Runs only once AI features are allowed, because the line
 * is the way into the coach.
 */
export function useCoachBrief(
  half: MaybeRefOrGetter<CoachBriefHalf>,
  day: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean>,
) {
  const query = useQuery(
    computed(() => ({
      queryKey: coachBriefKey(toValue(half), toValue(day)),
      queryFn: (): Promise<CoachBrief> => coachApi.brief(toValue(half)),
      enabled: toValue(enabled),
      staleTime: 60_000,
      retry: false,
    })),
  )
  return {
    brief: computed(() => query.data.value ?? null),
    isLoading: computed(() => query.isPending.value && query.fetchStatus.value === 'fetching'),
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

/** Opens (or reopens) the chat that starts with a half's brief and returns the thread. */
export function useOpenBrief() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (half: CoachBriefHalf) => coachApi.create(half),
    onSuccess: (thread) => queryClient.removeQueries({ queryKey: coachThreadKey(thread.id) }),
  })
}

/** The owner's AI cost view (slice 11c). */
export function useAiCosts() {
  const query = useQuery(
    queryOptions({
      queryKey: ['ai', 'costs'] as const,
      queryFn: (): Promise<AiCostsResponse> => coachApi.costs(),
      staleTime: 60_000,
      retry: false,
    }),
  )
  return {
    data: computed(() => query.data.value ?? null),
    isLoading: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
