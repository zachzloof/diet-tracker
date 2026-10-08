<script setup lang="ts">
import type { ExerciseMeasure, WorkoutSet } from '@diet-tracker/shared'
import { computed, ref, watch } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import { parseNumber, setLabel } from './draft'

/**
 * One set, built for a thumb between sets: the number pill toggles warm-up, the greyed
 * "last time" fills the row from the previous session, the inputs take kg and reps (or
 * seconds and metres), and the tick marks it done. Every change saves a moment later.
 */
const props = defineProps<{
  set: WorkoutSet
  index: number
  measures: readonly ExerciseMeasure[]
  /** The matching set from the last session with this exercise, if any. */
  previous: WorkoutSet | null
}>()

const emit = defineEmits<{ update: [set: WorkoutSet] }>()

interface Field {
  key: 'weightKg' | 'reps' | 'durationS' | 'distanceM'
  unit: string
  inputmode: 'decimal' | 'numeric'
  step: number
}
const FIELDS: Readonly<Record<ExerciseMeasure, Field>> = {
  weight: { key: 'weightKg', unit: 'kg', inputmode: 'decimal', step: 2.5 },
  reps: { key: 'reps', unit: 'reps', inputmode: 'numeric', step: 1 },
  time: { key: 'durationS', unit: 's', inputmode: 'numeric', step: 5 },
  distance: { key: 'distanceM', unit: 'm', inputmode: 'decimal', step: 50 },
}
const fields = computed(() => props.measures.map((measure) => FIELDS[measure]))

// Inputs hold text while being typed; the parsed number goes up on every keystroke.
const text = ref<Record<Field['key'], string>>({
  weightKg: '',
  reps: '',
  durationS: '',
  distanceM: '',
})
watch(
  () => props.set,
  (set) => {
    for (const key of ['weightKg', 'reps', 'durationS', 'distanceM'] as const) {
      const value = set[key]
      const shown = value === null ? '' : String(value)
      if (parseNumber(text.value[key]) !== value) text.value[key] = shown
    }
  },
  { immediate: true, deep: true },
)

function commit(field: Field, raw: string): void {
  text.value[field.key] = raw
  const value = parseNumber(raw)
  const rounded = value === null ? null : field.inputmode === 'numeric' ? Math.round(value) : value
  if (rounded === props.set[field.key]) return
  emit('update', { ...props.set, [field.key]: rounded })
}

function toggleDone(): void {
  emit('update', { ...props.set, completed: !props.set.completed })
}

function toggleWarmup(): void {
  emit('update', { ...props.set, isWarmup: !props.set.isWarmup })
}

const previousLabel = computed(() =>
  props.previous ? setLabel(props.previous, props.measures) : '',
)

function fillFromPrevious(): void {
  if (!props.previous) return
  emit('update', {
    ...props.set,
    weightKg: props.previous.weightKg,
    reps: props.previous.reps,
    durationS: props.previous.durationS,
    distanceM: props.previous.distanceM,
  })
}

const inputId = (key: string) => `set-${props.set.id}-${key}`
</script>

<template>
  <div
    class="flex items-center gap-2 rounded-control py-1"
    :class="set.completed ? 'bg-met/10' : ''"
  >
    <button
      type="button"
      class="flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums transition"
      :class="set.isWarmup ? 'bg-close/20 text-fg' : 'bg-surface-2 text-fg-muted'"
      :aria-label="
        set.isWarmup
          ? `Set ${index + 1}, warm-up. Tap to count it`
          : `Set ${index + 1}. Tap to mark as warm-up`
      "
      :aria-pressed="set.isWarmup"
      @click="toggleWarmup"
    >
      {{ set.isWarmup ? 'W' : index + 1 }}
    </button>

    <button
      type="button"
      class="min-h-9 w-[4.75rem] shrink-0 truncate text-left text-xs text-fg-muted tabular-nums disabled:opacity-60"
      :disabled="!previous"
      :aria-label="previous ? `Last time ${previousLabel}. Tap to use it` : 'No earlier set'"
      @click="fillFromPrevious"
    >
      {{ previousLabel || '–' }}
    </button>

    <label v-for="field in fields" :key="field.key" class="relative min-w-0 flex-1">
      <span class="sr-only">{{ field.unit }} for set {{ index + 1 }}</span>
      <input
        :id="inputId(field.key)"
        :value="text[field.key]"
        type="text"
        :inputmode="field.inputmode"
        autocomplete="off"
        enterkeyhint="next"
        :placeholder="previous && previous[field.key] !== null ? String(previous[field.key]) : '–'"
        class="h-11 w-full rounded-control border border-border bg-surface-2 pr-8 pl-2 text-center text-base text-fg tabular-nums outline-none placeholder:text-fg-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/30"
        @input="commit(field, ($event.target as HTMLInputElement).value)"
      />
      <span
        class="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[11px] text-fg-muted"
        aria-hidden="true"
        >{{ field.unit }}</span
      >
    </label>

    <button
      type="button"
      class="flex size-11 shrink-0 items-center justify-center rounded-control border transition"
      :class="
        set.completed ? 'border-met bg-met text-bg' : 'border-border bg-surface-2 text-fg-muted'
      "
      :aria-label="
        set.completed ? `Set ${index + 1} done. Tap to undo` : `Mark set ${index + 1} done`
      "
      :aria-pressed="set.completed"
      @click="toggleDone"
    >
      <Icon name="check" :size="20" />
    </button>
  </div>
</template>
