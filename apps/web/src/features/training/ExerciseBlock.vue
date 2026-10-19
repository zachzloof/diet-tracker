<script setup lang="ts">
import {
  MAX_EXERCISE_HISTORY,
  MAX_SETS_PER_EXERCISE,
  bestSetAt,
  liftMetric,
  nextSet,
  primaryMeasure,
  type ExerciseMeasure,
  type SetMetric,
  type WorkoutExerciseInput,
  type WorkoutSet,
} from '@diet-tracker/shared'
import { v7 as uuidv7 } from 'uuid'
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import { usePreferences } from '@/features/profile/usePreferences'
import { formatDayShort } from '@/lib/format'
import type { SetReference } from '@/stores/ui'
import SetRow from './SetRow.vue'
import { useExerciseHistory } from './useTraining'

/**
 * One exercise in the session: its sets with a reference beside each (the matching set from
 * last time, or the best at that position over the last 20 sessions, by the Last / Best
 * switch in the header), add and remove, a note.
 */
const props = defineProps<{
  block: WorkoutExerciseInput
  measures: readonly ExerciseMeasure[]
  /** The session being edited, so the reference column skips it. */
  workoutId: string
  reference: SetReference
}>()

const emit = defineEmits<{ update: [block: WorkoutExerciseInput]; remove: [] }>()

const prefs = usePreferences()

// This session is already the newest on the server (it saves as you go), so it is left out.
const history = useExerciseHistory(() => props.block.exerciseId, MAX_EXERCISE_HISTORY)
const others = computed(() =>
  history.history.value.filter((entry) => entry.workoutId !== props.workoutId),
)
const previous = computed(() => others.value[0] ?? null)

/** What "best" ranks on for this exercise (D39): kg lifted in a set, else its first measure. */
const metric = computed<SetMetric>(() =>
  liftMetric(
    primaryMeasure(props.measures) ?? 'weight',
    prefs.value.bestBy,
    props.measures.includes('reps'),
  ),
)
const METRIC_WORDS: Readonly<Record<SetMetric, string>> = {
  volume: 'weight × reps',
  weight: 'heaviest',
  reps: 'most reps',
  time: 'longest',
  distance: 'furthest',
}

function referenceSet(index: number): WorkoutSet | null {
  if (props.reference === 'best') return bestSetAt(others.value, index, metric.value)
  return previous.value?.sets[index] ?? null
}

const referenceLine = computed(() => {
  if (!previous.value) return ''
  if (props.reference === 'best') {
    const n = others.value.length
    return `Best of your last ${n} ${n === 1 ? 'session' : 'sessions'} · ${METRIC_WORDS[metric.value]}`
  }
  const n = previous.value.sets.length
  return `Last time ${formatDayShort(previous.value.day)} · ${n} ${n === 1 ? 'set' : 'sets'}`
})

const noteOpen = ref(props.block.notes.length > 0)
const removeArmed = ref(false)
const full = computed(() => props.block.sets.length >= MAX_SETS_PER_EXERCISE)

function updateSet(set: WorkoutSet): void {
  emit('update', {
    ...props.block,
    sets: props.block.sets.map((existing) => (existing.id === set.id ? set : existing)),
  })
}

function addSet(): void {
  if (full.value) return
  emit('update', {
    ...props.block,
    sets: [...props.block.sets, nextSet(props.block.sets, uuidv7())],
  })
}

function removeLastSet(): void {
  emit('update', { ...props.block, sets: props.block.sets.slice(0, -1) })
}

function setNotes(notes: string): void {
  emit('update', { ...props.block, notes })
}

function remove(): void {
  if (!removeArmed.value) {
    removeArmed.value = true
    window.setTimeout(() => (removeArmed.value = false), 3000)
    return
  }
  emit('remove')
}
</script>

<template>
  <section
    class="rounded-card border border-border bg-surface p-3"
    :aria-label="block.exerciseName"
  >
    <div class="flex items-center justify-between gap-2">
      <h3 class="min-w-0 truncate text-base font-semibold text-fg">{{ block.exerciseName }}</h3>
      <div class="flex shrink-0 items-center">
        <IconButton
          :label="noteOpen ? 'Hide note' : 'Add a note'"
          icon="pencil"
          @click="noteOpen = !noteOpen"
        />
        <button
          type="button"
          class="flex h-11 min-w-11 items-center justify-center rounded-control px-2 text-sm font-medium transition"
          :class="removeArmed ? 'bg-over/15 text-over' : 'text-fg-muted'"
          :aria-label="
            removeArmed
              ? `Tap again to remove ${block.exerciseName}`
              : `Remove ${block.exerciseName}`
          "
          @click="remove"
        >
          <span v-if="removeArmed">Remove?</span>
          <Icon v-else name="x" :size="20" />
        </button>
      </div>
    </div>
    <p v-if="referenceLine" class="mt-0.5 text-xs text-fg-muted">{{ referenceLine }}</p>

    <div
      v-if="block.sets.length"
      class="mt-2 flex items-center gap-1.5 px-1 text-[11px] font-medium text-fg-muted uppercase"
      aria-hidden="true"
    >
      <span class="w-8 text-center">Set</span>
      <span class="w-14">{{ reference === 'best' ? 'Best' : 'Last' }}</span>
      <span v-for="measure in measures" :key="measure" class="flex-1 text-center">
        {{
          measure === 'weight'
            ? 'kg'
            : measure === 'reps'
              ? 'Reps'
              : measure === 'time'
                ? 'Sec'
                : 'Metres'
        }}
      </span>
      <span class="w-10 text-center">Done</span>
    </div>

    <div class="mt-1 space-y-1">
      <SetRow
        v-for="(set, index) in block.sets"
        :key="set.id"
        :set="set"
        :index="index"
        :measures="measures"
        :reference="referenceSet(index)"
        :reference-kind="reference"
        @update="updateSet"
      />
    </div>

    <div class="mt-2 flex items-center gap-2">
      <Button variant="secondary" class="flex-1" :disabled="full" @click="addSet">
        <Icon name="plus" :size="18" /> Add set
      </Button>
      <IconButton
        v-if="block.sets.length"
        label="Remove last set"
        icon="minus"
        @click="removeLastSet"
      />
    </div>

    <label v-if="noteOpen" class="mt-2 block">
      <span class="sr-only">Note for {{ block.exerciseName }}</span>
      <input
        :value="block.notes"
        type="text"
        placeholder="Belt on, pause reps, felt heavy…"
        maxlength="500"
        class="h-11 w-full rounded-control border border-border bg-surface-2 px-3 text-base text-fg outline-none placeholder:text-fg-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/30"
        @input="setNotes(($event.target as HTMLInputElement).value)"
      />
    </label>
  </section>
</template>
