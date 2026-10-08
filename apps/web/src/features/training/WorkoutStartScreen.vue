<script setup lang="ts">
import {
  addDays,
  emptyWorkout,
  isValidDay,
  repeatWorkout,
  type Workout,
} from '@diet-tracker/shared'
import { v7 as uuidv7 } from 'uuid'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/ui/AppShell.vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useLocalDay } from '@/features/log/useLocalDay'
import { formatDay, formatDayShort } from '@/lib/format'
import { useWorkoutDraftStore } from '@/stores/workout-draft'
import { sessionLine, workoutTitle } from './draft'
import { useWorkouts } from './useTraining'

/** Start a session: empty, or a repeat of a recent one with the same exercises and sets. */
const route = useRoute()
const router = useRouter()
const drafts = useWorkoutDraftStore()
const { today } = useLocalDay()

const queryDay =
  typeof route.query.day === 'string' && isValidDay(route.query.day) ? route.query.day : null
const day = ref(queryDay ?? today.value)
const dayLabel = computed(() =>
  day.value === today.value
    ? 'Today'
    : day.value === addDays(today.value, -1)
      ? 'Yesterday'
      : formatDay(day.value),
)

// The last month of sessions, one per title, newest first: the routines worth repeating.
const recent = useWorkouts(
  () => addDays(today.value, -30),
  () => today.value,
)
const templates = computed<Workout[]>(() => {
  const seen = new Set<string>()
  return recent.workouts.value.filter((workout) => {
    if (!workout.endedAt || workout.exercises.length === 0) return false
    const key = workoutTitle(workout.title).toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
})

function begin(input: ReturnType<typeof emptyWorkout>): void {
  const id = uuidv7()
  drafts.start(id, input)
  void router.replace({ name: 'workout', params: { id } })
}

function startEmpty(): void {
  begin(emptyWorkout(day.value, new Date().toISOString()))
}

function repeat(workout: Workout): void {
  begin(
    repeatWorkout(workout, { day: day.value, startedAt: new Date().toISOString(), newId: uuidv7 }),
  )
}
</script>

<template>
  <AppShell title="New workout" :back="{ name: 'workouts' }">
    <div class="space-y-5">
      <div class="space-y-1.5">
        <label for="workout-day" class="block text-sm font-medium text-fg-muted">Day</label>
        <div class="flex items-center gap-2">
          <input
            id="workout-day"
            v-model="day"
            type="date"
            :max="today"
            class="h-12 min-w-0 flex-1 rounded-control border border-border bg-surface-2 px-4 text-base text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
          <span class="shrink-0 text-sm text-fg-muted">{{ dayLabel }}</span>
        </div>
      </div>

      <Button block @click="startEmpty">
        <Icon name="plus" :size="20" /> Start an empty session
      </Button>

      <section aria-labelledby="repeat-heading" class="space-y-2">
        <h2 id="repeat-heading" class="px-1 text-sm font-semibold text-fg-muted">
          Or repeat a recent one
        </h2>
        <div v-if="recent.isLoading.value" class="space-y-2" aria-busy="true">
          <Skeleton v-for="i in 3" :key="i" class="h-16 w-full" rounded="card" />
        </div>
        <p v-else-if="templates.length === 0" class="px-1 text-sm text-fg-muted">
          Finished sessions from the last month will show here, one per name, ready to repeat with
          the same exercises and sets.
        </p>
        <ul v-else class="divide-y divide-border rounded-card border border-border bg-surface">
          <li v-for="workout in templates" :key="workout.id">
            <button
              type="button"
              class="flex min-h-14 w-full items-center justify-between gap-3 px-3 py-2 text-left"
              @click="repeat(workout)"
            >
              <span class="min-w-0">
                <span class="block truncate text-base font-medium text-fg">{{
                  workoutTitle(workout.title)
                }}</span>
                <span class="block truncate text-sm text-fg-muted">
                  {{ formatDayShort(workout.day) }} · {{ workout.exercises.length }}
                  {{ workout.exercises.length === 1 ? 'exercise' : 'exercises' }} ·
                  {{ sessionLine(workout) }}
                </span>
              </span>
              <Icon name="refresh" :size="20" class="shrink-0 text-fg-muted" />
            </button>
          </li>
        </ul>
      </section>
    </div>
  </AppShell>
</template>
