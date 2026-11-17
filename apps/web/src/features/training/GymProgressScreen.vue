<script setup lang="ts">
import {
  MAX_WORKOUTS_RANGE_DAYS,
  MUSCLE_GROUP_LABELS,
  addDays,
  comparePeriods,
  muscleGroupSets,
  personalRecords,
  previousWindow,
  sessionsByWeekday,
  strengthTrends,
  tonnageParts,
  trainingCalendar,
  weekStreaks,
  weeklyTotals,
  windowEnding,
  type ProgressWorkout,
} from '@diet-tracker/shared'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '@/components/ui/AppShell.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import StatTile from '@/components/ui/StatTile.vue'
import { useLocalDay } from '@/features/log/useLocalDay'
import { usePreferences } from '@/features/profile/usePreferences'
import { formatDay, formatNumber } from '@/lib/format'
import { HISTORY_RANGES, rangeWindow } from '@/lib/ranges'
import { useUiStore } from '@/stores/ui'
import { useWorkoutDraftStore } from '@/stores/workout-draft'
import ProgressConsistencyCard from './ProgressConsistencyCard.vue'
import ProgressMusclesCard from './ProgressMusclesCard.vue'
import ProgressRecordsCard from './ProgressRecordsCard.vue'
import ProgressStrengthCard from './ProgressStrengthCard.vue'
import ProgressWeeksCard from './ProgressWeeksCard.vue'
import { formatDuration } from './draft'
import { useExercises, useWorkouts } from './useTraining'

/**
 * The gym half's Progress (pushed from You and from the gym Week): a range of finished
 * sessions against the range before it, week by week, how steady the training has been,
 * where the sets went, estimated one-rep maxes and the records set. Two year-long reads
 * (this year and the one before, the most one read may ask for) are sliced on the phone,
 * so changing the range never waits and every range has a full previous range to compare
 * with. The maths is `training/progress.ts` (docs/TRAINING-MATHS.md, "Progress over a range").
 */
const ui = useUiStore()
const router = useRouter()
const drafts = useWorkoutDraftStore()
const prefs = usePreferences()
const { today } = useLocalDay()

const range = ref('90')
const span = computed(() => windowEnding(today.value, Number(range.value)))
const windowLabel = computed(() => rangeWindow(range.value))

// This year and the year before; the API answers at most MAX_WORKOUTS_RANGE_DAYS per read.
const yearFrom = computed(() => addDays(today.value, -(MAX_WORKOUTS_RANGE_DAYS - 1)))
const earlierTo = computed(() => addDays(yearFrom.value, -1))
const earlierFrom = computed(() => addDays(earlierTo.value, -(MAX_WORKOUTS_RANGE_DAYS - 1)))
const recent = useWorkouts(yearFrom, today)
const earlier = useWorkouts(earlierFrom, earlierTo)
const exercises = useExercises()

/** Saved sessions plus any still on this phone, with the feel the drafts carry. */
const workouts = computed<ProgressWorkout[]>(() => {
  const saved = [...recent.workouts.value, ...earlier.workouts.value]
  const ids = new Set(saved.map((workout) => workout.id))
  const local = drafts.pending
    .filter((draft) => !ids.has(draft.id))
    .map((draft) => ({ id: draft.id, ...draft.input }))
  return [...saved, ...local]
})
const anyFinished = computed(() => workouts.value.some((workout) => workout.endedAt !== null))

const exerciseById = computed(
  () => new Map(exercises.exercises.value.map((exercise) => [exercise.id, exercise])),
)

/** The first day read: comparisons and records never reach past it. */
const recordsSince = computed(() => (earlier.hasData.value ? earlierFrom.value : yearFrom.value))

const comparison = computed(() => comparePeriods(workouts.value, span.value, recordsSince.value))
const current = computed(() => comparison.value.current)
const weeks = computed(() => weeklyTotals(workouts.value, span.value))
const streaks = computed(() => weekStreaks(workouts.value, today.value))
const calendar = computed(() => trainingCalendar(workouts.value, span.value))
const weekdays = computed(() => sessionsByWeekday(workouts.value, span.value))
const muscles = computed(() =>
  muscleGroupSets(workouts.value, span.value, (exerciseId) =>
    exerciseId ? exerciseById.value.get(exerciseId)?.muscleGroups : undefined,
  ).map((share) => ({
    ...share,
    label: share.group === 'unassigned' ? 'Not grouped' : MUSCLE_GROUP_LABELS[share.group],
  })),
)
const lifts = computed(() => strengthTrends(workouts.value, span.value))
const records = computed(() =>
  personalRecords(workouts.value, span.value, {
    measuresOf: (exerciseId) =>
      exerciseId ? exerciseById.value.get(exerciseId)?.measures : undefined,
    basis: prefs.value.bestBy,
  }),
)

/** "+12%", "−8%", "no change"; null when there is nothing to compare with. */
function change(ratio: number | null): string | undefined {
  if (ratio === null) return undefined
  const pct = Math.round(ratio * 100)
  if (pct === 0) return 'level with before'
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)}% on before`
}

const lifted = computed(() => tonnageParts(current.value.volumeKg))
const perWeek = computed(() => formatNumber(Math.round(current.value.sessionsPerWeek * 10) / 10, 1))
const compareLine = computed(() => {
  const previous = comparison.value.previous
  if (!previous) return null
  const before = previousWindow(span.value)
  const sessions = previous.sessions === 1 ? '1 session' : `${previous.sessions} sessions`
  return `"On before" is the ${windowLabel.value} before: ${formatDay(before.from)} to ${formatDay(before.to)}, ${sessions}.`
})

const loading = computed(
  () => (recent.isLoading.value && !recent.hasData.value) || exercises.isLoading.value,
)
const failed = computed(() => recent.isError.value && !recent.hasData.value)

/** The Time tile: whole hours from ten hours up, so a long range never wraps the tile. */
function tileDuration(minutes: number): string {
  return minutes >= 600 ? `${Math.round(minutes / 60)} h` : formatDuration(minutes)
}
</script>

<template>
  <AppShell title="Progress" :back="{ name: 'gym-week' }">
    <div class="space-y-4">
      <SegmentedControl v-model="range" label="Range" :options="HISTORY_RANGES" />

      <Card v-if="loading && !ui.online">
        <h2 class="flex items-center gap-2 text-base font-semibold">
          <Icon name="wifi-off" :size="20" class="text-fg-muted" /> You're offline
        </h2>
        <p class="mt-1 text-sm text-fg-muted">
          Your training history isn't saved on this phone, so progress needs a connection.
        </p>
        <Button class="mt-4" variant="secondary" @click="recent.refetch()">Try again</Button>
      </Card>

      <div v-else-if="loading" class="space-y-4" aria-busy="true">
        <div class="grid grid-cols-2 gap-2">
          <Skeleton v-for="i in 4" :key="i" class="h-20" rounded="card" />
        </div>
        <Skeleton class="h-52 w-full" rounded="card" />
        <Skeleton class="h-44 w-full" rounded="card" />
        <Skeleton class="h-40 w-full" rounded="card" />
      </div>

      <Card v-else-if="failed">
        <h2 class="text-base font-semibold">Couldn't load your training</h2>
        <p class="mt-1 text-sm text-fg-muted">
          {{ recent.error.value?.message ?? 'Something went wrong.' }}
        </p>
        <Button class="mt-4" variant="secondary" @click="recent.refetch()">Try again</Button>
      </Card>

      <Card v-else-if="!anyFinished" :padded="false">
        <EmptyState
          icon="trending-up"
          title="No sessions yet"
          description="Finish a workout and your sessions, volume, strength and records start showing here."
        >
          <Button @click="router.push({ name: 'workout-new' })">
            <Icon name="plus" :size="20" /> Log a workout
          </Button>
        </EmptyState>
      </Card>

      <template v-else>
        <div class="grid grid-cols-2 gap-2">
          <StatTile
            label="Sessions"
            :value="current.sessions"
            :sub="change(comparison.change.sessions) ?? `${perWeek} a week`"
          />
          <StatTile
            label="Lifted"
            :value="formatNumber(lifted.value, lifted.decimals)"
            :unit="lifted.unit"
            :sub="change(comparison.change.volumeKg) ?? 'working sets'"
          />
          <StatTile
            label="Sets"
            :value="current.workingSets"
            :sub="
              change(comparison.change.workingSets) ??
              (current.avgSetsPerSession === null
                ? 'working sets'
                : `${formatNumber(current.avgSetsPerSession, 1)} a session`)
            "
          />
          <StatTile
            label="Time"
            :value="current.minutes > 0 ? tileDuration(current.minutes) : '–'"
            :sub="
              change(comparison.change.minutes) ??
              (current.avgSessionMin === null
                ? 'training'
                : `${formatDuration(Math.round(current.avgSessionMin))} a session`)
            "
          />
        </div>
        <p class="-mt-2 px-1 text-xs text-fg-muted">
          {{ perWeek }} sessions a week over the last {{ windowLabel
          }}<template v-if="current.avgSessionMin !== null"
            >, {{ formatDuration(Math.round(current.avgSessionMin)) }} each on average</template
          ><template v-if="current.avgFeel !== null">
            , feeling {{ formatNumber(current.avgFeel, 1) }} out of 5</template
          >.
          <template v-if="compareLine">{{ compareLine }}</template>
        </p>

        <Card v-if="current.sessions === 0">
          <h2 class="text-base font-semibold">Nothing in the last {{ windowLabel }}</h2>
          <p class="mt-1 text-sm text-fg-muted">
            No finished sessions in this range.
            {{ range === HISTORY_RANGES.at(-1)?.value ? '' : 'Pick a longer range above.' }}
          </p>
        </Card>

        <template v-else>
          <ProgressWeeksCard :weeks="weeks" :today="today" />
          <ProgressConsistencyCard
            :streaks="streaks"
            :calendar="calendar"
            :weekdays="weekdays"
            :days-trained="current.daysTrained"
            :days="current.days"
          />
          <ProgressStrengthCard :lifts="lifts" />
          <ProgressRecordsCard
            :records="records"
            :since="recordsSince"
            :window-label="windowLabel"
          />
          <ProgressMusclesCard :muscles="muscles" />
        </template>
      </template>
    </div>
  </AppShell>
</template>
