import type { Workout, WorkoutInput } from '@diet-tracker/shared'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { workoutsApi } from '@/features/training/api'
import { EXERCISES_KEY, WORKOUTS_KEY, workoutKey } from '@/features/training/keys'
import { ApiError } from '@/lib/api'
import { queryClient } from '@/lib/query-client'

/**
 * Sessions being logged (D35). A session is one document: it lives here and in localStorage
 * while it is open, and every change schedules a `PUT /workouts/:id` a moment later. A dead
 * signal in the gym changes nothing on the screen; the document goes up when the connection
 * is back or the app is next opened. Last write wins per id, so a retry can never half-save.
 */

export type DraftStatus = 'saved' | 'saving' | 'pending' | 'error'

export interface WorkoutDraft {
  id: string
  userId: string
  input: WorkoutInput
  /** Changed since the last successful save. */
  dirty: boolean
  savedAt: string | null
  /** The last save's message when it failed for a reason other than the network. */
  error: string | null
}

const STORAGE_KEY = 'dt.workout-drafts'
const SAVE_DELAY_MS = 800

function readDrafts(): Record<string, WorkoutDraft> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, WorkoutDraft>) : {}
  } catch {
    return {}
  }
}

function writeDrafts(drafts: Record<string, WorkoutDraft>): void {
  try {
    if (Object.keys(drafts).length === 0) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts))
  } catch {
    // Storage full or blocked: the draft still lives for this session.
  }
}

/** `ME_KEY` from useSession, spelled out here because useSession clears this store on logout. */
const ME_KEY = ['me'] as const

function currentUserId(): string {
  const user = queryClient.getQueryData<{ id: string } | null>(ME_KEY)
  return user?.id ?? 'anonymous'
}

function toInput(workout: Workout): WorkoutInput {
  return {
    day: workout.day,
    startedAt: workout.startedAt,
    endedAt: workout.endedAt,
    title: workout.title,
    notes: workout.notes,
    feel: workout.feel,
    exercises: workout.exercises,
  }
}

export const useWorkoutDraftStore = defineStore('workout-draft', () => {
  const drafts = ref<Record<string, WorkoutDraft>>(readDrafts())
  const saving = ref<Record<string, boolean>>({})
  const timers = new Map<string, number>()

  function persist(): void {
    writeDrafts(drafts.value)
  }

  function get(id: string): WorkoutDraft | null {
    return drafts.value[id] ?? null
  }

  /** This person's drafts not yet on the server, for the "waiting to send" line on Today. */
  const pending = computed(() => {
    const userId = currentUserId()
    return Object.values(drafts.value).filter((draft) => draft.userId === userId && draft.dirty)
  })

  function status(id: string): DraftStatus {
    const draft = drafts.value[id]
    if (!draft) return 'saved'
    if (saving.value[id]) return 'saving'
    if (draft.error) return 'error'
    return draft.dirty ? 'pending' : 'saved'
  }

  /** Begins a new session on this phone and sends it straight away. */
  function start(id: string, input: WorkoutInput): WorkoutDraft {
    const draft: WorkoutDraft = {
      id,
      userId: currentUserId(),
      input,
      dirty: true,
      savedAt: null,
      error: null,
    }
    drafts.value = { ...drafts.value, [id]: draft }
    persist()
    schedule(id)
    return draft
  }

  /** A server copy becomes the working draft unless an unsent local one already exists. */
  function seed(workout: Workout): WorkoutDraft {
    const existing = drafts.value[workout.id]
    if (existing?.dirty) return existing
    const draft: WorkoutDraft = {
      id: workout.id,
      userId: currentUserId(),
      input: toInput(workout),
      dirty: false,
      savedAt: workout.updatedAt,
      error: null,
    }
    drafts.value = { ...drafts.value, [workout.id]: draft }
    persist()
    return draft
  }

  function update(id: string, change: (input: WorkoutInput) => WorkoutInput): void {
    const draft = drafts.value[id]
    if (!draft) return
    drafts.value = {
      ...drafts.value,
      [id]: { ...draft, input: change(draft.input), dirty: true, error: null },
    }
    persist()
    schedule(id)
  }

  function schedule(id: string): void {
    const existing = timers.get(id)
    if (existing !== undefined) window.clearTimeout(existing)
    timers.set(
      id,
      window.setTimeout(() => {
        timers.delete(id)
        void save(id)
      }, SAVE_DELAY_MS),
    )
  }

  /** Sends the draft now. Resolves true when the server has it. */
  async function save(id: string): Promise<boolean> {
    const draft = drafts.value[id]
    if (!draft || !draft.dirty || saving.value[id]) return draft ? !draft.dirty : false
    if (!navigator.onLine) return false
    saving.value = { ...saving.value, [id]: true }
    const sent = draft.input
    try {
      const workout = await workoutsApi.put(id, sent)
      const current = drafts.value[id]
      if (current) {
        // A change made while the request was in flight keeps the draft dirty for the next save.
        const stillDirty = current.input !== sent
        drafts.value = {
          ...drafts.value,
          [id]: { ...current, dirty: stillDirty, savedAt: workout.updatedAt, error: null },
        }
        persist()
        if (stillDirty) schedule(id)
      }
      queryClient.setQueryData(workoutKey(id), workout)
      void queryClient.invalidateQueries({ queryKey: WORKOUTS_KEY })
      void queryClient.invalidateQueries({ queryKey: EXERCISES_KEY })
      return true
    } catch (error) {
      const current = drafts.value[id]
      if (current && error instanceof ApiError && !error.isNetwork) {
        drafts.value = { ...drafts.value, [id]: { ...current, error: error.message } }
        persist()
      }
      return false
    } finally {
      const { [id]: _done, ...rest } = saving.value
      saving.value = rest
    }
  }

  /** Sends every unsent draft of this person, oldest first: on reconnect and at start-up. */
  async function flush(): Promise<void> {
    for (const draft of pending.value) await save(draft.id)
  }

  /** Forgets a draft that is safely on the server, so storage stays small. */
  function release(id: string): void {
    const draft = drafts.value[id]
    if (!draft || draft.dirty || saving.value[id]) return
    const { [id]: _gone, ...rest } = drafts.value
    drafts.value = rest
    persist()
  }

  /** Drops a draft whatever its state (the session was deleted). */
  function discard(id: string): void {
    const timer = timers.get(id)
    if (timer !== undefined) window.clearTimeout(timer)
    timers.delete(id)
    const { [id]: _gone, ...rest } = drafts.value
    drafts.value = rest
    persist()
  }

  function clear(): void {
    for (const timer of timers.values()) window.clearTimeout(timer)
    timers.clear()
    drafts.value = {}
    persist()
  }

  return { drafts, pending, get, status, start, seed, update, save, flush, release, discard, clear }
})
