<script setup lang="ts">
import {
  addDays,
  emptyWorkout,
  isValidDay,
  repeatWorkout,
  summariseWorkouts,
  type Workout,
} from '@diet-tracker/shared'
import { v7 as uuidv7 } from 'uuid'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/ui/AppShell.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import DayStepper from '@/components/ui/DayStepper.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useLocalDay } from '@/features/log/useLocalDay'
import { formatDay, formatDayShort } from '@/lib/format'
import { useUiStore } from '@/stores/ui'
import { useWorkoutDraftStore } from '@/stores/workout-draft'
import SessionRows from './SessionRows.vue'
import { formatDuration, formatVolume, mergeSessions, workoutTitle } from './draft'
import { useWorkouts } from './useTraining'

/**
 * The gym half's Today (D38): the day's sessions, a way to start one, and recent sessions
 * to repeat in a tap. Steps back through days like the food Today; `/gym/day/:day` opens
 * a specific day from the week strip.
 */
const route = useRoute()
const router = useRouter()
const ui = useUiStore()
const drafts = useWorkoutDraftStore()
const { today } = useLocalDay()

function routeDay(): string | null {
  const param = route.params.day
  return typeof param === 'string' && isValidDay(param) ? param : null
}

const viewedDay = ref(routeDay() ?? today.value)
watch(today, (next, previous) => {
  if (viewedDay.value === previous) viewedDay.value = next
})
watch(
  () => route.params.day,
  () => {
    const day = routeDay()
    if (day) viewedDay.value = day
    else if (route.name === 'gym-today') viewedDay.value = today.value
  },
)

const isToday = computed(() => viewedDay.value === today.value)
const dayLabel = computed(() => {
  if (isToday.value) return 'Today'
  if (viewedDay.value === addDays(today.value, -1)) return 'Yesterday'
  return formatDay(viewedDay.value)
})
const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
})

// The month up to the viewed day serves both the day's list and the repeat shortcuts.
const workouts = useWorkouts(
  () => addDays(viewedDay.value, -30),
  () => viewedDay.value,
)
const sessions = computed(() =>
  mergeSessions(workouts.workouts.value, drafts.pending, viewedDay.value),
)
const inProgress = computed(() => sessions.value.find((session) => !session.endedAt) ?? null)
const totals = computed(() => summariseWorkouts(sessions.value))
const summaryLine = computed(() => {
  const t = totals.value
  if (t.sessions === 0) return inProgress.value ? 'A session is under way.' : null
  const parts = [
    t.sessions === 1 ? '1 session' : `${t.sessions} sessions`,
    `${t.workingSets} ${t.workingSets === 1 ? 'set' : 'sets'}`,
  ]
  if (t.volumeKg > 0) parts.push(formatVolume(t.volumeKg))
  if (t.minutes > 0) parts.push(formatDuration(t.minutes))
  return parts.join(' · ')
})

// Finished sessions, one per name, newest first: the routines worth repeating.
const templates = computed<Workout[]>(() => {
  const seen = new Set<string>()
  return workouts.workouts.value
    .filter((workout) => {
      if (!workout.endedAt || workout.exercises.length === 0) return false
      const key = workoutTitle(workout.title).toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 4)
})

function begin(input: ReturnType<typeof emptyWorkout>): void {
  const id = uuidv7()
  drafts.start(id, input)
  void router.push({ name: 'workout', params: { id } })
}
function startEmpty(): void {
  begin(emptyWorkout(viewedDay.value, new Date().toISOString()))
}
function repeat(workout: Workout): void {
  begin(
    repeatWorkout(workout, {
      day: viewedDay.value,
      startedAt: new Date().toISOString(),
      newId: uuidv7,
    }),
  )
}

const loading = computed(() => workouts.isLoading.value && !workouts.hasData.value)
const failed = computed(() => workouts.isError.value && !workouts.hasData.value)
</script>

<template>
  <AppShell title="Today">
    <DayStepper
      :label="dayLabel"
      :is-current="isToday"
      @prev="viewedDay = addDays(viewedDay, -1)"
      @next="viewedDay = addDays(viewedDay, 1)"
      @reset="viewedDay = today"
    />

    <Card v-if="loading && !ui.online" class="mt-2">
      <h2 class="flex items-center gap-2 text-base font-semibold">
        <Icon name="wifi-off" :size="20" class="text-fg-muted" /> You're offline
      </h2>
      <p class="mt-1 text-sm text-fg-muted">
        Your sessions aren't saved on this phone yet. A session you log now stays here until you're
        back online.
      </p>
      <div class="mt-4 flex gap-2">
        <Button variant="secondary" class="flex-1" @click="workouts.refetch()">Try again</Button>
        <Button class="flex-1" @click="startEmpty"><Icon name="plus" :size="20" /> Log</Button>
      </div>
    </Card>

    <div v-else-if="loading" class="mt-2 space-y-4" aria-busy="true">
      <Skeleton class="h-8 w-48" />
      <Skeleton class="h-16 w-full" rounded="card" />
      <Skeleton class="h-12 w-full" rounded="control" />
      <Skeleton class="h-40 w-full" rounded="card" />
    </div>

    <Card v-else-if="failed" class="mt-2">
      <h2 class="text-base font-semibold">Couldn't load your sessions</h2>
      <p class="mt-1 text-sm text-fg-muted">
        {{ workouts.error.value?.message ?? 'Something went wrong.' }}
      </p>
      <Button class="mt-4" variant="secondary" @click="workouts.refetch()">Try again</Button>
    </Card>

    <div v-else class="mt-2 space-y-4">
      <div>
        <p class="text-[28px] leading-tight font-bold">
          {{ isToday ? greeting : formatDay(viewedDay) }}
        </p>
        <p class="mt-1 text-sm text-fg-muted">
          {{ summaryLine ?? (isToday ? 'Rest day so far.' : 'No session logged.') }}
        </p>
      </div>

      <p
        v-if="drafts.pending.length > 0"
        class="flex items-center gap-2 rounded-card border border-border bg-surface-2 px-3 py-2 text-sm text-fg-muted"
        role="status"
      >
        <Icon name="clock" :size="18" class="shrink-0" />
        {{ drafts.pending.length }}
        {{ drafts.pending.length === 1 ? 'session is' : 'sessions are' }} waiting for a connection.
        {{ ui.online ? 'Sending…' : 'They send when you are back online.' }}
      </p>

      <SessionRows v-if="sessions.length" :sessions="sessions" />

      <Card v-else :padded="false">
        <EmptyState
          icon="dumbbell"
          :title="isToday ? 'Nothing logged yet' : 'Nothing logged this day'"
          description="Start a session and log each set as you go, or repeat a recent one below."
        >
          <Button @click="startEmpty"><Icon name="plus" :size="20" /> Log a workout</Button>
        </EmptyState>
      </Card>

      <Button v-if="sessions.length" block variant="secondary" @click="startEmpty">
        <Icon name="plus" :size="20" />
        {{ inProgress ? 'Log another workout' : 'Log a workout' }}
      </Button>

      <section v-if="templates.length" aria-labelledby="repeat-heading" class="space-y-2">
        <h2 id="repeat-heading" class="px-1 text-sm font-semibold text-fg-muted">
          Repeat a recent session
        </h2>
        <ul class="divide-y divide-border rounded-card border border-border bg-surface">
          <li v-for="workout in templates" :key="workout.id">
            <button
              type="button"
              class="flex min-h-14 w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-surface-2"
              @click="repeat(workout)"
            >
              <span class="min-w-0">
                <span class="block truncate text-base font-medium text-fg">{{
                  workoutTitle(workout.title)
                }}</span>
                <span class="block truncate text-sm text-fg-muted">
                  {{ formatDayShort(workout.day) }} · {{ workout.exercises.length }}
                  {{ workout.exercises.length === 1 ? 'exercise' : 'exercises' }}
                </span>
              </span>
              <Icon name="refresh" :size="20" class="shrink-0 text-fg-muted" />
            </button>
          </li>
        </ul>
      </section>

      <p v-if="!ui.online" class="px-2 text-center text-xs text-fg-muted">
        Offline: a session you log now stays on this phone until you are back online.
      </p>
    </div>
  </AppShell>
</template>
