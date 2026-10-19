<script setup lang="ts">
import {
  MAX_EXERCISE_HISTORY,
  bestSetBy,
  liftMetric,
  primaryMeasure,
  setMetricValue,
  type ExerciseHistoryEntry,
  type ExerciseMeasure,
  type SetMetric,
  type WorkoutSet,
} from '@diet-tracker/shared'
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AppShell from '@/components/ui/AppShell.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Icon from '@/components/ui/Icon.vue'
import LineChart from '@/components/ui/LineChart.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import StatTile from '@/components/ui/StatTile.vue'
import { usePreferences } from '@/features/profile/usePreferences'
import { formatDayShort } from '@/lib/format'
import { useUiStore } from '@/stores/ui'
import { formatMetricValue, setLabel, workoutTitle } from './draft'
import { useExerciseHistory, useExercises } from './useTraining'

/**
 * One exercise over its last sessions: the best working set per session on a line, the best
 * and the latest, and each session's best set with a way into it. A lift is ranked on the kg
 * lifted in one set or the heaviest weight as Preferences says (D39); other exercises on
 * reps, seconds or metres. The maths is `bestSetBy` (docs/TRAINING-MATHS.md).
 */
const route = useRoute()
const ui = useUiStore()
const prefs = usePreferences()
const id = computed(() => (typeof route.params.id === 'string' ? route.params.id : ''))

const exercises = useExercises()
const exercise = computed(
  () => exercises.exercises.value.find((candidate) => candidate.id === id.value) ?? null,
)
const measures = computed<readonly ExerciseMeasure[]>(
  () => exercise.value?.measures ?? ['weight', 'reps'],
)
/** What the chart and the tiles rank on: kg lifted or kg on the bar for a lift, else reps, time, distance. */
const metric = computed<SetMetric>(() =>
  liftMetric(
    primaryMeasure(measures.value) ?? 'weight',
    prefs.value.bestBy,
    measures.value.includes('reps'),
  ),
)
const unit = computed(
  () => ({ volume: 'kg', weight: 'kg', reps: 'reps', time: 's', distance: 'm' })[metric.value],
)
const METRIC_NOTES: Readonly<Record<SetMetric, string>> = {
  volume: 'kg lifted in one set, weight × reps',
  weight: 'heaviest weight',
  reps: 'most reps',
  time: 'longest',
  distance: 'furthest',
}

const history = useExerciseHistory(id, MAX_EXERCISE_HISTORY)

interface Point {
  entry: ExerciseHistoryEntry
  best: WorkoutSet | null
  value: number | null
}
function valueOf(set: WorkoutSet | null): number | null {
  return set ? setMetricValue(set, metric.value) : null
}
// Oldest first for the chart; the API answers newest first.
const points = computed<Point[]>(() =>
  [...history.history.value].reverse().map((entry) => {
    const best = bestSetBy(entry.sets, metric.value)
    return { entry, best, value: valueOf(best) }
  }),
)
const chartPoints = computed(() => points.value.map((p) => p.value))
const chartLabels = computed(() => points.value.map((p) => formatDayShort(p.entry.day)))
const latest = computed(() => points.value[points.value.length - 1] ?? null)
const best = computed(() =>
  points.value.reduce<Point | null>(
    (top, p) => (p.value !== null && (top === null || p.value > (top.value ?? 0)) ? p : top),
    null,
  ),
)

function formatValue(value: number | null): string {
  return value === null ? '–' : formatMetricValue(value, metric.value)
}

/** Under a tile: the set itself when the value is kg lifted, then the day. */
function tileSub(point: Point | null): string | undefined {
  if (!point) return undefined
  const day = formatDayShort(point.entry.day)
  return metric.value === 'volume' && point.best
    ? `${setLabel(point.best, measures.value)} · ${day}`
    : day
}

const loading = computed(() => exercises.isLoading.value || history.isLoading.value)
</script>

<template>
  <AppShell :title="exercise?.name ?? 'Lift'" :back="{ name: 'lifts' }">
    <Card v-if="loading && !ui.online">
      <h2 class="flex items-center gap-2 text-base font-semibold">
        <Icon name="wifi-off" :size="20" class="text-fg-muted" /> You're offline
      </h2>
      <p class="mt-1 text-sm text-fg-muted">This exercise's history isn't saved on this phone.</p>
      <Button class="mt-4" variant="secondary" @click="history.refetch()">Try again</Button>
    </Card>

    <div v-else-if="loading" class="space-y-4" aria-busy="true">
      <div class="grid grid-cols-2 gap-2">
        <Skeleton class="h-20" rounded="card" />
        <Skeleton class="h-20" rounded="card" />
      </div>
      <Skeleton class="h-48 w-full" rounded="card" />
      <Skeleton class="h-40 w-full" rounded="card" />
    </div>

    <Card v-else-if="history.isError.value">
      <h2 class="text-base font-semibold">Couldn't load this exercise</h2>
      <p class="mt-1 text-sm text-fg-muted">
        {{ history.error.value?.message ?? 'It may have been removed.' }}
      </p>
      <Button class="mt-4" variant="secondary" @click="history.refetch()">Try again</Button>
    </Card>

    <Card v-else-if="points.length === 0">
      <h2 class="text-base font-semibold">Nothing logged yet</h2>
      <p class="mt-1 text-sm text-fg-muted">
        Finish a session with this exercise and its best set lands here.
      </p>
    </Card>

    <div v-else class="space-y-4">
      <div class="grid grid-cols-2 gap-2">
        <StatTile label="Best" :value="formatValue(best?.value ?? null)" :sub="tileSub(best)" />
        <StatTile
          label="Latest"
          :value="formatValue(latest?.value ?? null)"
          :sub="tileSub(latest)"
        />
      </div>

      <Card v-if="points.length > 1">
        <h2 class="flex items-center gap-2 text-base font-semibold">
          <Icon name="trending-up" :size="20" class="text-accent" />
          Best set per session
        </h2>
        <p class="mt-0.5 text-xs text-fg-muted">{{ METRIC_NOTES[metric] }}</p>
        <LineChart
          class="mt-2"
          :points="chartPoints"
          :labels="chartLabels"
          :label="`Best ${unit} per session`"
          :unit="unit"
          domain="auto"
          :label-every="points.length > 8 ? 3 : 1"
          :decimals="metric === 'weight' ? 1 : 0"
          empty-label="no working set"
        />
      </Card>

      <section aria-label="Sessions" class="space-y-1">
        <h2 class="px-1 text-sm font-semibold text-fg-muted">
          Last {{ points.length }} {{ points.length === 1 ? 'session' : 'sessions' }}
        </h2>
        <ul class="divide-y divide-border rounded-card border border-border bg-surface">
          <li v-for="p in [...points].reverse()" :key="p.entry.workoutId">
            <RouterLink
              :to="{ name: 'workout', params: { id: p.entry.workoutId } }"
              class="flex min-h-14 items-center justify-between gap-3 px-3 py-2 transition hover:bg-surface-2"
            >
              <span class="min-w-0">
                <span class="block truncate text-base font-medium text-fg">
                  {{ p.best ? setLabel(p.best, measures) : 'No working set' }}
                </span>
                <span class="block truncate text-sm text-fg-muted">
                  {{ formatDayShort(p.entry.day) }} · {{ workoutTitle(p.entry.title) }} ·
                  {{ p.entry.sets.length }} {{ p.entry.sets.length === 1 ? 'set' : 'sets' }}
                </span>
              </span>
              <Icon name="chevron-right" :size="20" class="shrink-0 text-fg-muted" />
            </RouterLink>
          </li>
        </ul>
      </section>
    </div>
  </AppShell>
</template>
