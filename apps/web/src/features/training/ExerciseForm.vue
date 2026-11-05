<script setup lang="ts">
import {
  EXERCISE_KINDS,
  EXERCISE_KIND_LABELS,
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABELS,
  exerciseInputSchema,
  toValidationDetails,
  type Exercise,
  type ExerciseKind,
  type ExerciseMeasure,
  type MuscleGroup,
} from '@diet-tracker/shared'
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import { ApiError } from '@/lib/api'
import { useUiStore } from '@/stores/ui'
import { useCreateExercise, useDeleteExercise, useUpdateExercise } from './useTraining'

/**
 * One of your own exercises: a new one, or an existing one to change or delete. Saving a
 * change reaches the sessions already logged (the new name, and the kilograms when the
 * bodyweight share moves, D44). The parent gives each exercise its own instance (a `key`),
 * so the fields start from the props and are never reset under the person's thumbs.
 */
const props = defineProps<{
  /** The exercise being edited; left out to add a new one. */
  exercise?: Exercise | null
  /** A new exercise starts with this name (what was typed in the search box). */
  initialName?: string
}>()

const emit = defineEmits<{ saved: [exercise: Exercise]; deleted: []; back: [] }>()

const ui = useUiStore()
const create = useCreateExercise()
const update = useUpdateExercise()
const remove = useDeleteExercise()

const editing = computed(() => Boolean(props.exercise))

const RECORDS: { value: string; label: string; measures: ExerciseMeasure[] }[] = [
  { value: 'weight_reps', label: 'Weight and reps', measures: ['weight', 'reps'] },
  { value: 'reps', label: 'Reps only', measures: ['reps'] },
  { value: 'time', label: 'Time', measures: ['time'] },
  { value: 'time_distance', label: 'Time and distance', measures: ['time', 'distance'] },
  { value: 'weight_distance', label: 'Weight and distance', measures: ['weight', 'distance'] },
]
/** How much of the person a rep lifts (D44); offered for a bodyweight exercise that counts reps. */
const SHARES: { value: string; label: string; share: number }[] = [
  { value: 'all', label: 'All of it (pull-up, dip)', share: 1 },
  { value: 'most', label: 'About two thirds (push-up)', share: 0.7 },
  { value: 'half', label: 'About half (sit-up)', share: 0.5 },
  { value: 'third', label: 'About a third (crunch)', share: 0.3 },
  { value: 'none', label: 'None', share: 0 },
]

/** The option whose measures are exactly the exercise's, else weight and reps. */
function recordsOf(measures: readonly ExerciseMeasure[]): string {
  const match = RECORDS.find(
    (option) =>
      option.measures.length === measures.length &&
      option.measures.every((measure) => measures.includes(measure)),
  )
  return match?.value ?? 'weight_reps'
}
/** The nearest of the offered shares, for one set outside this form. */
function shareOf(value: number): string {
  return SHARES.reduce((best, option) =>
    Math.abs(option.share - value) < Math.abs(best.share - value) ? option : best,
  ).value
}

const name = ref(props.exercise?.name ?? props.initialName ?? '')
const kind = ref<ExerciseKind>(props.exercise?.kind ?? 'barbell')
const muscleGroup = ref<MuscleGroup | ''>(props.exercise?.muscleGroups[0] ?? '')
const records = ref(props.exercise ? recordsOf(props.exercise.measures) : 'weight_reps')
const share = ref(props.exercise ? shareOf(props.exercise.bodyweightShare) : 'all')
const measures = computed(
  () => RECORDS.find((option) => option.value === records.value)?.measures ?? [],
)
const liftsBodyweight = computed(
  () => kind.value === 'bodyweight' && measures.value.includes('reps'),
)
const fieldErrors = ref<Record<string, string[]>>({})
const formError = ref<string | null>(null)

const kindOptions = EXERCISE_KINDS.map((value) => ({ value, label: EXERCISE_KIND_LABELS[value] }))
const muscleOptions = MUSCLE_GROUPS.map((value) => ({ value, label: MUSCLE_GROUP_LABELS[value] }))
const recordOptions = RECORDS.map(({ value, label }) => ({ value, label }))
const shareOptions = SHARES.map(({ value, label }) => ({ value, label }))

// A kind suggests what a set records; the person can still change it.
watch(kind, (next) => {
  if (next === 'cardio') records.value = 'time_distance'
  else if (next === 'bodyweight') records.value = 'reps'
  else if (records.value === 'time_distance' || records.value === 'reps')
    records.value = 'weight_reps'
})
// Entering the bodyweight case starts from "all of it", the default the server would take.
watch(liftsBodyweight, (now) => {
  if (now) share.value = 'all'
})

const saving = computed(() => create.isPending.value || update.isPending.value)

function fail(error: unknown): void {
  if (error instanceof ApiError) {
    fieldErrors.value = error.fieldErrors
    formError.value = Object.keys(error.fieldErrors).length ? null : error.message
  } else {
    formError.value = 'Could not save. Please try again.'
  }
}

function submit(): void {
  fieldErrors.value = {}
  formError.value = null
  // The form sets the first muscle group; an edit keeps any further ones the exercise had.
  const further = (props.exercise?.muscleGroups.slice(1) ?? []).filter(
    (group) => group !== muscleGroup.value,
  )
  const parsed = exerciseInputSchema.safeParse({
    name: name.value,
    kind: kind.value,
    muscleGroups: muscleGroup.value ? [muscleGroup.value, ...further] : [],
    measures: measures.value,
    // Left out for anything else, so the server's default for the kind applies (none).
    ...(liftsBodyweight.value
      ? { bodyweightShare: SHARES.find((option) => option.value === share.value)?.share ?? 1 }
      : {}),
  })
  if (!parsed.success) {
    fieldErrors.value = toValidationDetails(parsed.error).fieldErrors
    return
  }
  const onSuccess = (exercise: Exercise) => emit('saved', exercise)
  if (props.exercise) {
    update.mutate({ id: props.exercise.id, input: parsed.data }, { onSuccess, onError: fail })
  } else {
    create.mutate(parsed.data, { onSuccess, onError: fail })
  }
}

const confirmingDelete = ref(false)
function destroy(): void {
  if (!props.exercise) return
  if (!confirmingDelete.value) {
    confirmingDelete.value = true
    return
  }
  formError.value = null
  remove.mutate(props.exercise.id, {
    onSuccess: () => emit('deleted'),
    onError: (error: unknown) => {
      confirmingDelete.value = false
      formError.value =
        error instanceof ApiError ? error.message : 'Could not delete. Please try again.'
    },
  })
}
</script>

<template>
  <form class="space-y-4" novalidate @submit.prevent="submit">
    <Input
      v-model="name"
      label="Name"
      placeholder="Pistol squat"
      autocomplete="off"
      :error="fieldErrors.name?.[0] ?? null"
    />
    <Select v-model="kind" label="Equipment" :options="kindOptions" />
    <Select
      v-model="muscleGroup"
      label="Muscle group (optional)"
      :options="muscleOptions"
      placeholder="Pick one"
    />
    <Select
      v-model="records"
      label="A set records"
      :options="recordOptions"
      :error="fieldErrors.measures?.[0] ?? null"
    />
    <Select
      v-if="liftsBodyweight"
      v-model="share"
      label="Bodyweight each rep lifts"
      :options="shareOptions"
      helper="Counted in your kilograms lifted, at your weight on the day."
    />
    <p v-if="editing" class="text-sm text-fg-muted">
      Changes apply to the sessions you have already logged with it.
    </p>
    <p v-if="formError" class="text-sm text-over" role="alert">{{ formError }}</p>
    <div class="flex gap-2">
      <Button variant="secondary" class="flex-1" @click="emit('back')">
        {{ editing ? 'Cancel' : 'Back' }}
      </Button>
      <Button type="submit" class="flex-1" :loading="saving" :disabled="!ui.online">
        {{ !ui.online ? 'Offline' : editing ? 'Save' : 'Add' }}
      </Button>
    </div>
    <div v-if="editing" class="space-y-1.5 border-t border-border pt-4">
      <Button
        block
        variant="destructive"
        :loading="remove.isPending.value"
        :disabled="!ui.online"
        @click="destroy"
      >
        <Icon name="trash" :size="18" />
        {{ confirmingDelete ? 'Tap again to delete' : 'Delete exercise' }}
      </Button>
      <p class="text-sm text-fg-muted">
        Sessions you logged keep it by name. Its page under Lifts and its Last and Best go.
      </p>
    </div>
  </form>
</template>
