<script setup lang="ts">
import { EXERCISE_KIND_LABELS, MUSCLE_GROUP_LABELS, type Exercise } from '@diet-tracker/shared'
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Sheet from '@/components/ui/Sheet.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useUiStore } from '@/stores/ui'
import ExerciseForm from './ExerciseForm.vue'
import { useExercises } from './useTraining'

/**
 * Search the catalogue and your own exercises, recent first, or add one of your own. One of
 * your own has a pencil beside it: it opens the same form to change or delete it.
 */
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ pick: [exercise: Exercise] }>()

const ui = useUiStore()
const exercises = useExercises()

const q = ref('')
/** What the sheet shows: the list, the form for a new exercise, or the form for one of yours. */
const form = ref<{ exercise: Exercise | null } | null>(null)

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

watch(open, (isOpen) => {
  if (isOpen) return
  q.value = ''
  form.value = null
})

const title = computed(() =>
  !form.value ? 'Add exercise' : form.value.exercise ? 'Edit exercise' : 'Add your own exercise',
)

/** A new exercise goes straight into the session; an edited one returns to the list. */
function saved(exercise: Exercise): void {
  if (form.value?.exercise) {
    form.value = null
    ui.toast('Exercise saved', 'success')
  } else {
    pick(exercise)
  }
}

function deleted(): void {
  form.value = null
  ui.toast('Exercise deleted', 'success')
}
</script>

<template>
  <Sheet v-model:open="open" :title="title" size="tall">
    <ExerciseForm
      v-if="form"
      :key="form.exercise?.id ?? 'new'"
      :exercise="form.exercise"
      :initial-name="q.trim()"
      @saved="saved"
      @deleted="deleted"
      @back="form = null"
    />

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
              <li v-for="exercise in list" :key="exercise.id" class="flex items-center">
                <button
                  type="button"
                  class="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-3 px-3 py-2 text-left"
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
                <IconButton
                  v-if="exercise.custom"
                  class="mr-1 shrink-0"
                  :label="`Edit ${exercise.name}`"
                  icon="pencil"
                  @click="form = { exercise }"
                />
              </li>
            </ul>
          </section>
        </template>
      </template>

      <Button block variant="secondary" @click="form = { exercise: null }">
        <Icon name="plus" :size="18" /> Add your own
      </Button>
    </div>
  </Sheet>
</template>
