<script setup lang="ts">
import {
  MAX_EXERCISE_HISTORY,
  bestSet,
  type ExerciseHistoryEntry,
  type ExerciseMeasure,
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
import { formatDayShort, formatNumber } from '@/lib/format'
import { useUiStore } from '@/stores/ui'
import { formatDistance, formatSeconds, setLabel, workoutTitle } from './draft'
import { useExerciseHistory, useExercises } from './useTraining'

/**
 * One exercise over its last sessions: the best working set per session on a line (kg for
 * lifts, reps, seconds or metres otherwise), the best and the latest, and each session's
 * top set with a way into it. The maths is `bestSet` (docs/TRAINING-MATHS.md).
 */
const route = useRoute()
const ui = useUiStore()
const id = computed(() => (typeof route.params.id === 'string' ? route.params.id : ''))

const exercises = useExercises()
const exercise = computed(
  () => exercises.exercises.value.find((candidate) => candidate.id === id.value) ?? null,
)
const measures = computed<readonly ExerciseMeasure[]>(
  () => exercise.value?.measures ?? ['weight', 'reps'],
)
/** The measure on the chart: weight for a lift, else reps, time or distance. */
const measure = computed<ExerciseMeasure>(() => {
  const order: ExerciseMeasure[] = ['weight', 'reps', 'time', 'distance']
  return order.find((candidate) => measures.value.includes(candidate)) ?? 'weight'
})
const unit = computed(
  () => ({ weight: 'kg', reps: 'reps', time: 's', distance: 'm' })[measure.value],
)

const history = useExerciseHistory(id, MAX_EXERCISE_HISTORY)

interface Point {
  entry: ExerciseHistoryEntry
  best: WorkoutSet | null
  value: number | null
}
function valueOf(set: WorkoutSet | null): number | null {
  if (!set) return null
  switch (measure.value) {
    case 'weight':
      return set.weightKg
    case 'reps':
      return set.reps
    case 'time':
      return set.durationS
    default:
      return set.distanceM
  }
}
// Oldest first for the chart; the API answers newest first.
const points = computed<Point[]>(() =>
  [...history.history.value].reverse().map((entry) => {
    const best = bestSet(entry.sets, measure.value)
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
  if (value === null) return '–'
  if (measure.value === 'time') return formatSeconds(value)
  if (measure.value === 'distance') return formatDistance(value)
  return `${formatNumber(value, 2)} ${unit.value}`
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
        <StatTile
          label="Best"
          :value="formatValue(best?.value ?? null)"
          :sub="best ? formatDayShort(best.entry.day) : undefined"
        />
        <StatTile
          label="Latest"
          :value="formatValue(latest?.value ?? null)"
          :sub="latest ? formatDayShort(latest.entry.day) : undefined"
        />
      </div>

      <Card v-if="points.length > 1">
        <h2 class="flex items-center gap-2 text-base font-semibold">
          <Icon name="trending-up" :size="20" class="text-accent" />
          Best set per session
        </h2>
        <LineChart
          class="mt-2"
          :points="chartPoints"
          :labels="chartLabels"
          :label="`Best ${unit} per session`"
          :unit="unit"
          domain="auto"
          :label-every="points.length > 8 ? 3 : 1"
          :decimals="measure === 'weight' ? 1 : 0"
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
