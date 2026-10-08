<script setup lang="ts">
import {
  MAX_SETS_PER_EXERCISE,
  nextSet,
  type ExerciseMeasure,
  type WorkoutExerciseInput,
  type WorkoutSet,
} from '@diet-tracker/shared'
import { v7 as uuidv7 } from 'uuid'
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import { formatDayShort } from '@/lib/format'
import SetRow from './SetRow.vue'
import { useExerciseHistory } from './useTraining'

/** One exercise in the session: its sets, "last time" beside each, add and remove, a note. */
const props = defineProps<{
  block: WorkoutExerciseInput
  measures: readonly ExerciseMeasure[]
  /** The session being edited, so "last time" skips it. */
  workoutId: string
}>()

const emit = defineEmits<{ update: [block: WorkoutExerciseInput]; remove: [] }>()

// Two sessions back when this one is already the newest on the server (it saves as you go).
const history = useExerciseHistory(() => props.block.exerciseId, 2)
const previous = computed(
  () => history.history.value.find((entry) => entry.workoutId !== props.workoutId) ?? null,
)
const previousSet = (index: number): WorkoutSet | null => previous.value?.sets[index] ?? null

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
    <p v-if="previous" class="mt-0.5 text-xs text-fg-muted">
      Last time {{ formatDayShort(previous.day) }} · {{ previous.sets.length }}
      {{ previous.sets.length === 1 ? 'set' : 'sets' }}
    </p>

    <div
      v-if="block.sets.length"
      class="mt-2 flex items-center gap-1.5 px-1 text-[11px] font-medium text-fg-muted uppercase"
      aria-hidden="true"
    >
      <span class="w-8 text-center">Set</span>
      <span class="w-14">Last</span>
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
        :previous="previousSet(index)"
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
