<script setup lang="ts">
import {
  MAX_WORKOUT_EXERCISES,
  nextSet,
  repeatWorkout,
  workoutSummary,
  type Exercise,
  type Workout,
  type WorkoutExerciseInput,
  type WorkoutInput,
} from '@diet-tracker/shared'
import { v7 as uuidv7 } from 'uuid'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/ui/AppShell.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Icon from '@/components/ui/Icon.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Textarea from '@/components/ui/Textarea.vue'
import { useLocalDay } from '@/features/log/useLocalDay'
import { ApiError } from '@/lib/api'
import { formatDay, formatMealTime } from '@/lib/format'
import { useUiStore } from '@/stores/ui'
import { useWorkoutDraftStore } from '@/stores/workout-draft'
import ExerciseBlock from './ExerciseBlock.vue'
import ExercisePicker from './ExercisePicker.vue'
import { blockMeasures, formatDuration, formatVolume, workoutTitle } from './draft'
import { useDeleteWorkout, useExercises, useWorkout } from './useTraining'

/**
 * The session screen (D35). The document lives in the draft store and saves itself a moment
 * after every change; the header says where it stands. Opening a session that is not on this
 * phone fetches it once and seeds the draft from the server copy.
 */
const route = useRoute()
const router = useRouter()
const ui = useUiStore()
const drafts = useWorkoutDraftStore()
const exercises = useExercises()
const deleteWorkout = useDeleteWorkout()
const { today } = useLocalDay()

const id = computed(() => (typeof route.params.id === 'string' ? route.params.id : ''))
const draft = computed(() => drafts.get(id.value))
const input = computed(() => draft.value?.input ?? null)

// Not on this phone: fetch it. The query is enabled only while there is no draft.
const remote = useWorkout(id)
watch(
  () => remote.workout.value,
  (workout: Workout | null) => {
    if (workout && !draft.value) drafts.seed(workout)
  },
  { immediate: true },
)

const status = computed(() => drafts.status(id.value))
const statusLabel = computed(() => {
  switch (status.value) {
    case 'saving':
      return 'Saving…'
    case 'pending':
      return ui.online ? 'Saving…' : 'Saved on this phone'
    case 'error':
      return 'Not saved'
    default:
      return 'Saved'
  }
})

function change(fn: (input: WorkoutInput) => WorkoutInput): void {
  drafts.update(id.value, fn)
}

const finished = computed(() => input.value?.endedAt !== null)
const summary = computed(() => (input.value ? workoutSummary(input.value) : null))
const full = computed(() => (input.value?.exercises.length ?? 0) >= MAX_WORKOUT_EXERCISES)

const FEEL = [
  { value: '1', label: 'Rough' },
  { value: '2', label: 'Meh' },
  { value: '3', label: 'OK' },
  { value: '4', label: 'Good' },
  { value: '5', label: 'Great' },
]
const feel = computed({
  get: () =>
    input.value?.feel === null || input.value?.feel === undefined ? '' : String(input.value.feel),
  set: (value: string) => change((current) => ({ ...current, feel: value ? Number(value) : null })),
})

const picking = ref(false)

function addExercise(exercise: Exercise): void {
  if (full.value) return
  const blockId = uuidv7()
  change((current) => ({
    ...current,
    exercises: [
      ...current.exercises,
      {
        id: blockId,
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        notes: '',
        sets: [nextSet([], uuidv7())],
      },
    ],
  }))
}

function updateBlock(block: WorkoutExerciseInput): void {
  change((current) => ({
    ...current,
    exercises: current.exercises.map((existing) => (existing.id === block.id ? block : existing)),
  }))
}

function removeBlock(blockId: string): void {
  change((current) => ({
    ...current,
    exercises: current.exercises.filter((block) => block.id !== blockId),
  }))
}

function finish(): void {
  change((current) => ({
    ...current,
    endedAt: new Date().toISOString(),
    // An untouched set at the end was never done; drop blank ones rather than count them.
    exercises: current.exercises.map((block) => ({
      ...block,
      sets: block.sets.filter(
        (set) =>
          set.weightKg !== null ||
          set.reps !== null ||
          set.durationS !== null ||
          set.distanceM !== null,
      ),
    })),
  }))
  ui.toast('Session finished. It is on Today.', 'success')
}

function reopen(): void {
  change((current) => ({ ...current, endedAt: null }))
}

function repeat(): void {
  if (!input.value) return
  const source: Workout = {
    id: id.value,
    ...input.value,
    createdAt: input.value.startedAt,
    updatedAt: input.value.startedAt,
  }
  const newId = uuidv7()
  drafts.start(
    newId,
    repeatWorkout(source, { day: today.value, startedAt: new Date().toISOString(), newId: uuidv7 }),
  )
  void router.push({ name: 'workout', params: { id: newId } })
}

const confirmingDelete = ref(false)
const deleteError = ref<string | null>(null)
function remove(): void {
  if (!confirmingDelete.value) {
    confirmingDelete.value = true
    return
  }
  deleteError.value = null
  const wasSaved = draft.value?.savedAt !== null
  if (!wasSaved) {
    // Never reached the server: forgetting it here is the whole deletion.
    drafts.discard(id.value)
    void router.replace({ name: 'workouts' })
    return
  }
  deleteWorkout.mutate(id.value, {
    onSuccess: () => {
      drafts.discard(id.value)
      ui.toast('Session deleted', 'success')
      void router.replace({ name: 'workouts' })
    },
    onError: (e: unknown) => {
      deleteError.value = e instanceof ApiError ? e.message : 'Could not delete. Please try again.'
    },
  })
}

// Leaving a session that is safely on the server frees its local copy.
onBeforeUnmount(() => drafts.release(id.value))

const loading = computed(() => !input.value && remote.isLoading.value)
const failed = computed(() => !input.value && remote.isError.value)
</script>

<template>
  <AppShell :title="input ? workoutTitle(input.title) : 'Workout'" :back="{ name: 'workouts' }">
    <template #header-right>
      <span
        v-if="input"
        class="flex items-center gap-1 text-xs"
        :class="status === 'error' ? 'text-over' : 'text-fg-muted'"
        role="status"
      >
        <Icon
          :name="status === 'saved' ? 'check' : status === 'error' ? 'alert' : 'clock'"
          :size="14"
        />
        {{ statusLabel }}
      </span>
    </template>

    <Card v-if="loading && !ui.online">
      <h2 class="flex items-center gap-2 text-base font-semibold">
        <Icon name="wifi-off" :size="20" class="text-fg-muted" /> You're offline
      </h2>
      <p class="mt-1 text-sm text-fg-muted">This session isn't saved on this phone yet.</p>
      <Button class="mt-4" variant="secondary" @click="remote.refetch()">Try again</Button>
    </Card>

    <div v-else-if="loading" class="space-y-4" aria-busy="true">
      <Skeleton class="h-12 w-full" />
      <Skeleton class="h-40 w-full" rounded="card" />
      <Skeleton class="h-40 w-full" rounded="card" />
    </div>

    <Card v-else-if="failed">
      <h2 class="text-base font-semibold">Couldn't open this session</h2>
      <p class="mt-1 text-sm text-fg-muted">
        {{ remote.error.value?.message ?? 'It may have been deleted on another device.' }}
      </p>
      <Button class="mt-4" variant="secondary" @click="router.replace({ name: 'workouts' })">
        Back to Workouts
      </Button>
    </Card>

    <div v-else-if="input" class="space-y-4">
      <div class="space-y-1.5">
        <label for="workout-title" class="sr-only">Session name</label>
        <input
          id="workout-title"
          :value="input.title"
          type="text"
          placeholder="Workout"
          maxlength="60"
          autocomplete="off"
          enterkeyhint="done"
          class="h-12 w-full rounded-control border border-border bg-surface-2 px-4 text-xl font-semibold text-fg outline-none placeholder:text-fg-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/30"
          @input="change((c) => ({ ...c, title: ($event.target as HTMLInputElement).value }))"
        />
        <p class="px-1 text-sm text-fg-muted">
          {{ input.day === today ? 'Today' : formatDay(input.day) }} · started
          {{ formatMealTime(input.startedAt) }}
          <template v-if="summary?.durationMin !== null && summary">
            · {{ formatDuration(summary.durationMin) }}</template
          >
        </p>
      </div>

      <p
        v-if="draft?.error"
        class="rounded-card bg-over/10 px-3 py-2 text-sm text-over"
        role="alert"
      >
        {{ draft.error }}
      </p>

      <ExerciseBlock
        v-for="block in input.exercises"
        :key="block.id"
        :block="block"
        :measures="blockMeasures(block, exercises.exercises.value)"
        :workout-id="id"
        @update="updateBlock"
        @remove="removeBlock(block.id)"
      />

      <p
        v-if="input.exercises.length === 0"
        class="rounded-card border border-dashed border-border p-4 text-sm text-fg-muted"
      >
        Add an exercise, then log each set as you go. What you did last time sits beside every set;
        tap it to copy it.
      </p>

      <Button
        block
        :variant="input.exercises.length ? 'secondary' : 'primary'"
        :disabled="full"
        @click="picking = true"
      >
        <Icon name="plus" :size="20" /> Add exercise
      </Button>
      <p v-if="full" class="text-sm text-fg-muted">
        A session can have up to {{ MAX_WORKOUT_EXERCISES }} exercises.
      </p>

      <Card v-if="finished && summary" as="section">
        <h2 class="text-base font-semibold">Finished</h2>
        <div class="mt-2 grid grid-cols-3 gap-2 text-center">
          <div>
            <p class="text-xl font-bold text-fg tabular-nums">
              {{ summary.durationMin === null ? '–' : formatDuration(summary.durationMin) }}
            </p>
            <p class="text-xs text-fg-muted">time</p>
          </div>
          <div>
            <p class="text-xl font-bold text-fg tabular-nums">{{ summary.workingSets }}</p>
            <p class="text-xs text-fg-muted">sets</p>
          </div>
          <div>
            <p class="text-xl font-bold text-fg tabular-nums">
              {{ formatVolume(summary.volumeKg) }}
            </p>
            <p class="text-xs text-fg-muted">lifted</p>
          </div>
        </div>
      </Card>

      <SegmentedControl v-model="feel" label="How did it feel?" :options="FEEL" />
      <Textarea
        :model-value="input.notes"
        label="Notes"
        placeholder="Sleep, energy, anything to remember next time"
        :rows="2"
        :maxlength="1000"
        @update:model-value="(value: string) => change((c) => ({ ...c, notes: value }))"
      />

      <div class="space-y-2">
        <Button v-if="!finished" block @click="finish">
          <Icon name="check" :size="20" /> Finish session
        </Button>
        <template v-else>
          <Button block variant="secondary" @click="repeat">
            <Icon name="refresh" :size="18" /> Repeat this session
          </Button>
          <Button block variant="ghost" @click="reopen">Reopen</Button>
        </template>
        <Button
          block
          variant="destructive"
          :loading="deleteWorkout.isPending.value"
          :disabled="!ui.online && draft?.savedAt !== null"
          @click="remove"
        >
          <Icon name="trash" :size="18" />
          {{ confirmingDelete ? 'Tap again to delete' : 'Delete session' }}
        </Button>
        <p v-if="deleteError" class="text-sm text-over" role="alert">{{ deleteError }}</p>
      </div>
    </div>

    <ExercisePicker v-model:open="picking" @pick="addExercise" />
  </AppShell>
</template>
