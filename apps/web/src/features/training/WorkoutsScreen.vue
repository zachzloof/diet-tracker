<script setup lang="ts">
import { MAX_WORKOUTS_RANGE_DAYS, addDays, type Workout } from '@diet-tracker/shared'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import AppShell from '@/components/ui/AppShell.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useLocalDay } from '@/features/log/useLocalDay'
import { formatDay } from '@/lib/format'
import { useUiStore } from '@/stores/ui'
import { useWorkoutDraftStore } from '@/stores/workout-draft'
import { sessionLine, workoutTitle } from './draft'
import { useWorkouts } from './useTraining'

/** The last three months of sessions, newest first, with a way to start another. */
const ui = useUiStore()
const drafts = useWorkoutDraftStore()
const { today } = useLocalDay()
const from = computed(() => addDays(today.value, -(MAX_WORKOUTS_RANGE_DAYS - 1)))
const workouts = useWorkouts(from, today)

interface Row {
  id: string
  title: string
  line: string
  local: boolean
}
interface DayGroup {
  day: string
  rows: Row[]
}

const groups = computed<DayGroup[]>(() => {
  const saved = workouts.workouts.value
  const local = drafts.pending.filter((draft) => !saved.some((w) => w.id === draft.id))
  const all: (Pick<Workout, 'id' | 'day' | 'title' | 'startedAt' | 'endedAt' | 'exercises'> & {
    local: boolean
  })[] = [
    ...local.map((draft) => ({ id: draft.id, ...draft.input, local: true })),
    ...saved.map((workout) => ({ ...workout, local: false })),
  ]
  all.sort((a, b) =>
    a.day === b.day ? b.startedAt.localeCompare(a.startedAt) : b.day.localeCompare(a.day),
  )
  const byDay = new Map<string, Row[]>()
  for (const session of all) {
    const row: Row = {
      id: session.id,
      title: workoutTitle(session.title),
      line: session.endedAt ? sessionLine(session) : 'In progress',
      local: session.local,
    }
    const list = byDay.get(session.day)
    if (list) list.push(row)
    else byDay.set(session.day, [row])
  }
  return [...byDay.entries()].map(([day, rows]) => ({ day, rows }))
})

function dayLabel(day: string): string {
  if (day === today.value) return 'Today'
  if (day === addDays(today.value, -1)) return 'Yesterday'
  return formatDay(day)
}
</script>

<template>
  <AppShell title="Workouts" :back="{ name: 'you' }">
    <template #header-right>
      <Button variant="ghost" @click="$router.push({ name: 'workout-new' })">
        <Icon name="plus" :size="20" /> New
      </Button>
    </template>

    <Card v-if="workouts.isLoading.value && !ui.online && groups.length === 0">
      <h2 class="flex items-center gap-2 text-base font-semibold">
        <Icon name="wifi-off" :size="20" class="text-fg-muted" /> You're offline
      </h2>
      <p class="mt-1 text-sm text-fg-muted">Your sessions aren't saved on this phone yet.</p>
      <Button class="mt-4" variant="secondary" @click="workouts.refetch()">Try again</Button>
    </Card>

    <div
      v-else-if="workouts.isLoading.value && groups.length === 0"
      class="space-y-3"
      aria-busy="true"
    >
      <Skeleton class="h-5 w-24" />
      <Skeleton class="h-16 w-full" rounded="card" />
      <Skeleton class="h-16 w-full" rounded="card" />
    </div>

    <Card v-else-if="workouts.isError.value && !workouts.hasData.value && groups.length === 0">
      <h2 class="text-base font-semibold">Couldn't load your sessions</h2>
      <p class="mt-1 text-sm text-fg-muted">
        {{ workouts.error.value?.message ?? 'Something went wrong.' }}
      </p>
      <Button class="mt-4" variant="secondary" @click="workouts.refetch()">Try again</Button>
    </Card>

    <Card v-else-if="groups.length === 0" :padded="false">
      <EmptyState
        icon="dumbbell"
        title="No sessions yet"
        description="Log a gym session with its exercises and sets. Next time, what you did last sits beside every set."
      >
        <Button @click="$router.push({ name: 'workout-new' })">
          <Icon name="plus" :size="20" /> Log a workout
        </Button>
      </EmptyState>
    </Card>

    <div v-else class="space-y-4">
      <section v-for="group in groups" :key="group.day" :aria-label="dayLabel(group.day)">
        <h2 class="px-1 pb-1 text-sm font-semibold text-fg-muted">{{ dayLabel(group.day) }}</h2>
        <ul class="divide-y divide-border rounded-card border border-border bg-surface">
          <li v-for="row in group.rows" :key="row.id">
            <RouterLink
              :to="{ name: 'workout', params: { id: row.id } }"
              class="flex min-h-14 items-center justify-between gap-3 px-3 py-2"
            >
              <span class="min-w-0">
                <span class="block truncate text-base font-medium text-fg">{{ row.title }}</span>
                <span class="block truncate text-sm text-fg-muted">
                  {{ row.line }}<template v-if="row.local"> · on this phone</template>
                </span>
              </span>
              <Icon name="chevron-right" :size="20" class="shrink-0 text-fg-muted" />
            </RouterLink>
          </li>
        </ul>
      </section>
      <p class="px-2 text-center text-xs text-fg-muted">
        Showing the last {{ MAX_WORKOUTS_RANGE_DAYS }} days. Older sessions are kept and will have a
        home when progress charts arrive.
      </p>
    </div>
  </AppShell>
</template>
