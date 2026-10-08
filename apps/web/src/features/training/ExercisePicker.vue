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
import Sheet from '@/components/ui/Sheet.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { ApiError } from '@/lib/api'
import { useUiStore } from '@/stores/ui'
import { useCreateExercise, useExercises } from './useTraining'

/** Search the catalogue and your own exercises, recent first, or add one of your own. */
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ pick: [exercise: Exercise] }>()

const ui = useUiStore()
const exercises = useExercises()
const create = useCreateExercise()

const q = ref('')
const adding = ref(false)

const filtered = computed(() => {
  const needle = q.value.trim().toLowerCase()
  if (!needle) return exercises.exercises.value
  return exercises.exercises.value.filter(
    (exercise) =>
      exercise.name.toLowerCase().includes(needle) ||
      exercise.muscleGroups.some((group) =>
        MUSCLE_GROUP_LABELS[group].toLowerCase().includes(needle),
      ) ||
      EXERCISE_KIND_LABELS[exercise.kind].toLowerCase().includes(needle),
  )
})
const recent = computed(() => filtered.value.filter((exercise) => exercise.lastUsedAt !== null))
const rest = computed(() => filtered.value.filter((exercise) => exercise.lastUsedAt === null))

function subtitle(exercise: Exercise): string {
  const groups = exercise.muscleGroups.map((group) => MUSCLE_GROUP_LABELS[group]).join(', ')
  return groups
    ? `${EXERCISE_KIND_LABELS[exercise.kind]} · ${groups}`
    : EXERCISE_KIND_LABELS[exercise.kind]
}

function pick(exercise: Exercise): void {
  emit('pick', exercise)
  open.value = false
}

// --- Add your own -------------------------------------------------------------------------

const RECORDS: { value: string; label: string; measures: ExerciseMeasure[] }[] = [
  { value: 'weight_reps', label: 'Weight and reps', measures: ['weight', 'reps'] },
  { value: 'reps', label: 'Reps only', measures: ['reps'] },
  { value: 'time', label: 'Time', measures: ['time'] },
  { value: 'time_distance', label: 'Time and distance', measures: ['time', 'distance'] },
  { value: 'weight_distance', label: 'Weight and distance', measures: ['weight', 'distance'] },
]
const name = ref('')
const kind = ref<ExerciseKind>('barbell')
const muscleGroup = ref<MuscleGroup | ''>('')
const records = ref('weight_reps')
const fieldErrors = ref<Record<string, string[]>>({})
const formError = ref<string | null>(null)

const kindOptions = EXERCISE_KINDS.map((value) => ({ value, label: EXERCISE_KIND_LABELS[value] }))
const muscleOptions = MUSCLE_GROUPS.map((value) => ({ value, label: MUSCLE_GROUP_LABELS[value] }))
const recordOptions = RECORDS.map(({ value, label }) => ({ value, label }))

// A kind suggests what a set records; the person can still change it.
watch(kind, (next) => {
  if (next === 'cardio') records.value = 'time_distance'
  else if (next === 'bodyweight') records.value = 'reps'
  else if (records.value === 'time_distance' || records.value === 'reps')
    records.value = 'weight_reps'
})

watch(open, (isOpen) => {
  if (isOpen) return
  q.value = ''
  adding.value = false
  fieldErrors.value = {}
  formError.value = null
})

function startAdding(): void {
  name.value = q.value.trim()
  adding.value = true
}

function submit(): void {
  fieldErrors.value = {}
  formError.value = null
  const parsed = exerciseInputSchema.safeParse({
    name: name.value,
    kind: kind.value,
    muscleGroups: muscleGroup.value ? [muscleGroup.value] : [],
    measures: RECORDS.find((option) => option.value === records.value)?.measures ?? [],
  })
  if (!parsed.success) {
    fieldErrors.value = toValidationDetails(parsed.error).fieldErrors
    return
  }
  create.mutate(parsed.data, {
    onSuccess: (exercise) => {
      name.value = ''
      muscleGroup.value = ''
      pick(exercise)
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError) {
        fieldErrors.value = error.fieldErrors
        formError.value = Object.keys(error.fieldErrors).length ? null : error.message
      } else {
        formError.value = 'Could not save. Please try again.'
      }
    },
  })
}
</script>

<template>
  <Sheet v-model:open="open" :title="adding ? 'Add your own exercise' : 'Add exercise'" size="tall">
    <form v-if="adding" class="space-y-4" novalidate @submit.prevent="submit">
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
      <p v-if="formError" class="text-sm text-over" role="alert">{{ formError }}</p>
      <div class="flex gap-2">
        <Button variant="secondary" class="flex-1" @click="adding = false">Back</Button>
        <Button
          type="submit"
          class="flex-1"
          :loading="create.isPending.value"
          :disabled="!ui.online"
        >
          {{ ui.online ? 'Add' : 'Offline' }}
        </Button>
      </div>
    </form>

    <div v-else class="space-y-3">
      <div class="relative">
        <span class="pointer-events-none absolute inset-y-0 left-4 flex items-center text-fg-muted">
          <Icon name="search" :size="18" />
        </span>
        <input
          v-model="q"
          type="search"
          placeholder="Search exercises"
          aria-label="Search exercises"
          autocomplete="off"
          enterkeyhint="search"
          class="h-12 w-full rounded-control border border-border bg-surface-2 pr-4 pl-11 text-base text-fg placeholder:text-fg-muted/70 transition outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      </div>

      <p v-if="exercises.isLoading.value && !ui.online" class="text-sm text-fg-muted">
        You're offline and the exercise list isn't saved on this phone yet. You can still add one by
        name once you are back online.
      </p>
      <div v-else-if="exercises.isLoading.value" class="space-y-2" aria-busy="true">
        <Skeleton v-for="i in 6" :key="i" class="h-14 w-full" />
      </div>
      <p
        v-else-if="exercises.isError.value && !exercises.hasData.value"
        class="text-sm text-fg-muted"
      >
        {{ exercises.error.value?.message ?? 'Could not load the exercises.' }}
        <button type="button" class="ml-1 font-semibold text-accent" @click="exercises.refetch()">
          Try again
        </button>
      </p>

      <template v-else>
        <p v-if="filtered.length === 0" class="py-4 text-center text-sm text-fg-muted">
          Nothing called "{{ q }}" yet. Add it as your own below.
        </p>
        <template
          v-for="[heading, list] in [
            ['Recent', recent],
            ['All', rest],
          ] as const"
          :key="heading"
        >
          <section v-if="list.length" :aria-label="heading">
            <h3 v-if="recent.length" class="px-1 pb-1 text-xs font-medium text-fg-muted uppercase">
              {{ heading }}
            </h3>
            <ul class="divide-y divide-border rounded-card border border-border bg-surface">
              <li v-for="exercise in list" :key="exercise.id">
                <button
                  type="button"
                  class="flex min-h-14 w-full items-center justify-between gap-3 px-3 py-2 text-left"
                  @click="pick(exercise)"
                >
                  <span class="min-w-0">
                    <span class="block truncate text-base font-medium text-fg">{{
                      exercise.name
                    }}</span>
                    <span class="block truncate text-xs text-fg-muted">{{
                      subtitle(exercise)
                    }}</span>
                  </span>
                  <span
                    v-if="exercise.custom"
                    class="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-fg-muted"
                    >Yours</span
                  >
                </button>
              </li>
            </ul>
          </section>
        </template>
      </template>

      <Button block variant="secondary" @click="startAdding">
        <Icon name="plus" :size="18" /> Add your own
      </Button>
    </div>
  </Sheet>
</template>
