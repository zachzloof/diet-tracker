import type {
  CoachCard,
  CoachCardState,
  CoachMessage,
  CoachThread,
  CoachThreadResponse,
} from '@diet-tracker/shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { coachApi } from '@/features/coach/api'
import { ApiError } from '@/lib/api'
import { queryClient } from '@/lib/query-client'

export const COACH_KEY = ['coach'] as const
export const COACH_THREADS_KEY = ['coach', 'threads'] as const
export const coachThreadKey = (id: string) => ['coach', 'thread', id] as const
export const COACH_NOTES_KEY = ['coach', 'notes'] as const

/** The turn in flight: what the person asked and what has streamed back so far. */
export interface PendingTurn {
  threadId: string
  text: string
  /** The latest status line ("Looking at this week"), cleared once text arrives. */
  status: string | null
  /** Every status line so far, kept so the trail reads after the answer. */
  statuses: string[]
  streamed: string
  /** Cards drafted so far, shown read-only until `done` lands the stored message. */
  cards: CoachCard[]
  /** Set when the request failed before the server could answer; the text is kept to retry. */
  error: string | null
}

/**
 * One turn at a time, kept outside the screen so navigating from the empty state to the
 * new thread's URL does not lose the stream. The screens read `pending` to draw the
 * person's bubble and the growing answer; `done` lands the stored messages in the query
 * cache so the thread reads the same after a reload.
 */
export const useCoachStore = defineStore('coach', () => {
  const pending = ref<PendingTurn | null>(null)
  let controller: AbortController | null = null

  function appendMessages(threadId: string, thread: CoachThread, messages: CoachMessage[]): void {
    queryClient.setQueryData<CoachThreadResponse>(coachThreadKey(threadId), (current) => ({
      thread,
      messages: [...(current?.messages ?? []), ...messages],
    }))
    void queryClient.invalidateQueries({ queryKey: COACH_THREADS_KEY })
  }

  /**
   * Sends `text` on `threadId`, creating a thread first when null, and resolves with the
   * thread id once the turn is stored. Throws an `ApiError` when nothing could be sent
   * (offline, cap reached, chat full); `pending.error` holds the same message.
   */
  async function send(threadId: string | null, text: string): Promise<string> {
    if (pending.value) throw new ApiError(409, 'conflict', 'The coach is still answering.')
    const id = threadId ?? (await coachApi.create()).id
    controller = new AbortController()
    pending.value = {
      threadId: id,
      text,
      status: null,
      statuses: [],
      streamed: '',
      cards: [],
      error: null,
    }
    try {
      const done = await coachApi.send(id, text, {
        signal: controller.signal,
        onEvent: (event) => {
          const turn = pending.value
          if (!turn || turn.threadId !== id) return
          if (event.event === 'status') {
            turn.status = event.data.text
            turn.statuses.push(event.data.text)
          } else if (event.event === 'delta') {
            turn.status = null
            turn.streamed += event.data.text
          } else if (event.event === 'card') {
            turn.status = null
            turn.cards.push(event.data.card)
          }
        },
      })
      appendMessages(id, done.thread, [done.user, done.assistant])
      pending.value = null
      return id
    } catch (error) {
      if (pending.value?.threadId === id) {
        pending.value.error =
          error instanceof Error ? error.message : 'The coach is unavailable right now.'
      }
      throw error
    } finally {
      controller = null
    }
  }

  /**
   * Records that a card was confirmed (its own endpoint has already run) or dismissed, and
   * lands the updated message in the thread's cache so the card reads the same after a
   * reload.
   */
  async function setCardState(
    threadId: string,
    cardId: string,
    state: Exclude<CoachCardState, 'drafted'>,
  ): Promise<void> {
    const message = await coachApi.setCardState(threadId, cardId, { state })
    queryClient.setQueryData<CoachThreadResponse>(coachThreadKey(threadId), (current) =>
      current
        ? {
            ...current,
            messages: current.messages.map((m) => (m.id === message.id ? message : m)),
          }
        : current,
    )
  }

  /** Drops a failed turn so the composer is free again (the text goes back to the composer). */
  function clear(): void {
    controller?.abort()
    controller = null
    pending.value = null
  }

  return { pending, send, setCardState, clear }
})
