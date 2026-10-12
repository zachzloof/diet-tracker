<script setup lang="ts">
import { addDays, summariseWorkouts } from '@diet-tracker/shared'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AppShell from '@/components/ui/AppShell.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import DayStepper from '@/components/ui/DayStepper.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import StatTile from '@/components/ui/StatTile.vue'
import { useLocalDay } from '@/features/log/useLocalDay'
import { useProfile } from '@/features/profile/useProfile'
import { formatDay, formatDayShort, formatNumber } from '@/lib/format'
import { useUiStore } from '@/stores/ui'
import { useWorkoutDraftStore } from '@/stores/workout-draft'
import SessionRows from './SessionRows.vue'
import TrainingDayStrip from './TrainingDayStrip.vue'
import { formatDuration, mergeSessions } from './draft'
import { useWorkouts } from './useTraining'

/**
 * The gym half's Week (D38): sessions, sets and weight lifted over the last seven days
 * against the training days declared in the profile, a tappable day strip, the week's
 * sessions by day, and the way to each lift's trend. Steps back a week at a time.
 */
const ui = useUiStore()
const router = useRouter()
const drafts = useWorkoutDraftStore()
const { today } = useLocalDay()
const { profile } = useProfile()

const end = ref(today.value)
watch(today, (next, previous) => {
  if (end.value === previous) end.value = next
})
const start = computed(() => addDays(end.value, -6))
const isCurrent = computed(() => end.value === today.value)
const rangeLabel = computed(() =>
  isCurrent.value
    ? 'Last 7 days'
    : `${formatDayShort(start.value)} to ${formatDayShort(end.value)}`,
)

const workouts = useWorkouts(start, end)
const sessions = computed(() => mergeSessions(workouts.workouts.value, drafts.pending))
const inWindow = computed(() =>
  sessions.value.filter((session) => session.day >= start.value && session.day <= end.value),
)
const totals = computed(() => summariseWorkouts(inWindow.value))
const planned = computed(() => profile.value?.trainingDaysPerWeek ?? 0)

const days = computed(() =>
  Array.from({ length: 7 }, (_, i) => {
    const day = addDays(start.value, i)
    return { day, sessions: inWindow.value.filter((session) => session.day === day).length }
  }),
)

interface DayGroup {
  day: string
  rows: typeof inWindow.value
}
const groups = computed<DayGroup[]>(() => {
  const byDay = new Map<string, typeof inWindow.value>()
  for (const session of inWindow.value) {
    const list = byDay.get(session.day)
    if (list) list.push(session)
    else byDay.set(session.day, [session])
  }
  return [...byDay.entries()].map(([day, rows]) => ({ day, rows }))
})

function dayLabel(day: string): string {
  if (day === today.value) return 'Today'
  if (day === addDays(today.value, -1)) return 'Yesterday'
  return formatDay(day)
}

const loading = computed(() => workouts.isLoading.value && !workouts.hasData.value)
const failed = computed(() => workouts.isError.value && !workouts.hasData.value)
</script>

<template>
  <AppShell title="Week">
    <DayStepper
      :label="rangeLabel"
      :is-current="isCurrent"
      unit="week"
      @prev="end = addDays(end, -7)"
      @next="end = addDays(end, 7) > today ? today : addDays(end, 7)"
      @reset="end = today"
    />

    <Card v-if="loading && !ui.online" class="mt-2">
      <h2 class="flex items-center gap-2 text-base font-semibold">
        <Icon name="wifi-off" :size="20" class="text-fg-muted" /> You're offline
      </h2>
      <p class="mt-1 text-sm text-fg-muted">This week isn't saved on this phone yet.</p>
      <Button class="mt-4" variant="secondary" @click="workouts.refetch()">Try again</Button>
    </Card>

    <div v-else-if="loading" class="mt-2 space-y-4" aria-busy="true">
      <div class="grid grid-cols-3 gap-2">
        <Skeleton class="h-20" rounded="card" />
        <Skeleton class="h-20" rounded="card" />
        <Skeleton class="h-20" rounded="card" />
      </div>
      <Skeleton class="h-16 w-full" rounded="card" />
      <Skeleton class="h-40 w-full" rounded="card" />
    </div>

    <Card v-else-if="failed" class="mt-2">
      <h2 class="text-base font-semibold">Couldn't load your week</h2>
      <p class="mt-1 text-sm text-fg-muted">
        {{ workouts.error.value?.message ?? 'Something went wrong.' }}
      </p>
      <Button class="mt-4" variant="secondary" @click="workouts.refetch()">Try again</Button>
    </Card>

    <div v-else class="mt-2 space-y-4">
      <div class="grid grid-cols-3 gap-2">
        <StatTile
          label="Sessions"
          :value="totals.sessions"
          :unit="planned > 0 ? `/ ${planned}` : undefined"
          :sub="planned > 0 ? 'planned' : 'this week'"
        />
        <StatTile
          label="Sets"
          :value="totals.workingSets"
          :sub="totals.daysTrained === 1 ? '1 day trained' : `${totals.daysTrained} days trained`"
        />
        <StatTile
          label="Lifted"
          :value="formatNumber(Math.round(totals.volumeKg), 0)"
          unit="kg"
          :sub="totals.minutes > 0 ? formatDuration(totals.minutes) : 'working sets'"
        />
      </div>

      <TrainingDayStrip :days="days" :today="today" />

      <Card v-if="inWindow.length === 0" :padded="false">
        <EmptyState
          icon="dumbbell"
          title="No sessions this week"
          description="Log a session and it shows here with your sets and the weight you lifted."
        >
          <Button @click="router.push({ name: 'workout-new' })">
            <Icon name="plus" :size="20" /> Log a workout
          </Button>
        </EmptyState>
      </Card>

      <section
        v-for="group in groups"
        v-else
        :key="group.day"
        :aria-label="dayLabel(group.day)"
        class="space-y-1"
      >
        <h2 class="px-1 text-sm font-semibold text-fg-muted">{{ dayLabel(group.day) }}</h2>
        <SessionRows :sessions="group.rows" />
      </section>

      <Card :padded="false">
        <RouterLink
          :to="{ name: 'lifts' }"
          class="flex min-h-14 items-center gap-3 px-4 py-3 transition hover:bg-surface-2"
        >
          <span
            class="flex size-10 items-center justify-center rounded-full bg-accent/15 text-accent"
          >
            <Icon name="trending-up" :size="20" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-base font-semibold">Lifts</span>
            <span class="block truncate text-sm text-fg-muted"
              >Your best set and the trend for every exercise</span
            >
          </span>
          <Icon name="chevron-right" :size="18" class="text-fg-muted" />
        </RouterLink>
      </Card>
    </div>
  </AppShell>
</template>
