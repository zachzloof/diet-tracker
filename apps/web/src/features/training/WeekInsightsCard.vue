<script setup lang="ts">
import {
  biggestDrop,
  biggestGain,
  type ExerciseMeasure,
  type LiftChange,
  type WeekComparison,
  type WorkoutSet,
} from '@diet-tracker/shared'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Chip, { type ChipTone } from '@/components/ui/Chip.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { formatNumber } from '@/lib/format'
import { formatDistance, formatSeconds, formatTonnage, setLabel } from './draft'

/**
 * "Week on week": this week's finished sessions against the previous seven days, from
 * `compareWeeks` (docs/TRAINING-MATHS.md). The biggest gain leads; then the totals and the
 * other lifts that moved; then what was new or missed. Each lift opens its trend.
 */
const props = defineProps<{
  comparison: WeekComparison | null
  /** The previous week is still loading. */
  loading: boolean
  /** The previous week could not be loaded (and nothing is cached). */
  error: string | null
  /** Whether the window is the current week ("last week") or an older one ("the week before"). */
  isCurrent: boolean
}>()

const emit = defineEmits<{ retry: [] }>()

const MAX_OTHER_LIFTS = 4

const before = computed(() => (props.isCurrent ? 'last week' : 'the week before'))

const gain = computed(() => (props.comparison ? biggestGain(props.comparison) : null))
const drop = computed(() => (props.comparison ? biggestDrop(props.comparison) : null))
const others = computed(() =>
  (props.comparison?.lifts ?? [])
    .filter((lift) => lift !== gain.value)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, MAX_OTHER_LIFTS),
)
const hiddenCount = computed(() =>
  Math.max(0, (props.comparison?.lifts.length ?? 0) - (gain.value ? 1 : 0) - others.value.length),
)
const previousEmpty = computed(() => (props.comparison?.previous.sessions ?? 0) === 0)

/** The best set in words for the measure it was chosen on: "105 kg × 5", "75 s", "5 km in 30 min". */
function bestLabel(set: WorkoutSet, measure: ExerciseMeasure): string {
  const measures: Record<ExerciseMeasure, ExerciseMeasure[]> = {
    weight: ['weight', 'reps'],
    reps: ['reps'],
    time: ['distance', 'time'],
    distance: ['distance', 'time'],
  }
  return setLabel(set, measures[measure])
}

/** "+2.5 kg", "−2 reps", "+15 s", "+200 m"; the unit the lift is compared on. */
function deltaLabel(lift: LiftChange): string {
  const sign = lift.delta > 0 ? '+' : lift.delta < 0 ? '−' : ''
  const size = Math.abs(lift.delta)
  switch (lift.measure) {
    case 'weight':
      return `${sign}${formatNumber(size, 2)} kg`
    case 'reps':
      return `${sign}${formatNumber(size, 0)} ${size === 1 ? 'rep' : 'reps'}`
    case 'time':
      return `${sign}${formatSeconds(Math.round(size))}`
    case 'distance':
      return `${sign}${formatDistance(size)}`
  }
}

function deltaTone(lift: LiftChange): ChipTone {
  return lift.delta > 0 ? 'met' : lift.delta < 0 ? 'short' : 'neutral'
}

function direction(lift: LiftChange): string {
  return lift.delta > 0 ? 'up' : lift.delta < 0 ? 'down' : 'same'
}

interface TotalRow {
  label: string
  value: string
  change: string
}
function countChange(current: number, previous: number, noun: string): string {
  const diff = current - previous
  if (diff === 0) return `same as ${before.value}`
  const size = Math.abs(diff)
  const word = size === 1 ? noun : `${noun}s`
  return diff > 0 ? `${size} more ${word}` : `${size} fewer ${word}`
}
const totals = computed<TotalRow[]>(() => {
  const c = props.comparison
  if (!c) return []
  const pct = c.volumeChangePct
  const volumeChange =
    pct === null
      ? c.previous.volumeKg === 0 && c.current.volumeKg > 0
        ? `nothing lifted ${before.value}`
        : `same as ${before.value}`
      : Math.round(pct * 100) === 0
        ? `same as ${before.value}`
        : `${pct > 0 ? 'up' : 'down'} ${Math.abs(Math.round(pct * 100))}% on ${before.value}`
  return [
    { label: 'Lifted', value: formatTonnage(c.current.volumeKg), change: volumeChange },
    {
      label: 'Sets',
      value: String(c.current.workingSets),
      change: countChange(c.current.workingSets, c.previous.workingSets, 'set'),
    },
    {
      label: 'Sessions',
      value: String(c.current.sessions),
      change: countChange(c.current.sessions, c.previous.sessions, 'session'),
    },
  ]
})

function liftRoute(exerciseId: string | null) {
  return exerciseId ? { name: 'lift', params: { id: exerciseId } } : null
}
</script>

<template>
  <Card as="section" aria-labelledby="week-on-week-heading">
    <h2 id="week-on-week-heading" class="flex items-center gap-2 text-base font-semibold">
      <Icon name="trending-up" :size="20" class="text-accent" />
      Week on week
    </h2>

    <div v-if="loading" class="mt-3 space-y-2" aria-busy="true">
      <Skeleton class="h-5 w-2/3" />
      <Skeleton class="h-4 w-1/2" />
      <Skeleton class="h-4 w-3/4" />
    </div>

    <div v-else-if="error">
      <p class="mt-3 text-sm text-fg-muted">Couldn't load {{ before }}. {{ error }}</p>
      <Button class="mt-3" variant="secondary" @click="emit('retry')">Try again</Button>
    </div>

    <template v-else-if="comparison">
      <p v-if="previousEmpty" class="mt-3 text-sm text-fg-muted">
        Nothing to compare yet: no sessions {{ before }}. Keep logging and next week shows what
        moved.
      </p>

      <template v-else>
        <!-- The headline: the lift whose best set rose the most. -->
        <div v-if="gain" class="mt-3 rounded-control bg-accent/10 p-3">
          <p class="text-xs font-medium tracking-wide text-fg-muted uppercase">Biggest gain</p>
          <component
            :is="liftRoute(gain.exerciseId) ? RouterLink : 'div'"
            :to="liftRoute(gain.exerciseId) ?? undefined"
            class="mt-1 flex items-center justify-between gap-3"
          >
            <span class="min-w-0">
              <span class="block truncate text-base font-semibold text-fg">{{
                gain.exerciseName
              }}</span>
              <span class="block text-sm text-fg-muted">
                {{ bestLabel(gain.current.best, gain.measure) }}, from
                {{ bestLabel(gain.previous.best, gain.measure) }} {{ before }}
              </span>
            </span>
            <span class="flex shrink-0 items-center gap-1">
              <Chip tone="met"><span class="sr-only">up </span>{{ deltaLabel(gain) }}</Chip>
              <Icon
                v-if="liftRoute(gain.exerciseId)"
                name="chevron-right"
                :size="18"
                class="text-fg-muted"
              />
            </span>
          </component>
        </div>
        <p v-else-if="comparison.lifts.length" class="mt-3 text-sm text-fg-muted">
          No best set rose on {{ before }}.
          <template v-if="drop">Hold the line and it comes back.</template>
        </p>
        <p v-else class="mt-3 text-sm text-fg-muted">
          None of this week's exercises were in {{ before }}, so there is no lift to compare.
        </p>

        <!-- The totals against the previous week. -->
        <dl class="mt-3 grid grid-cols-3 gap-2">
          <div v-for="row in totals" :key="row.label" class="min-w-0">
            <dt class="text-xs text-fg-muted">{{ row.label }}</dt>
            <dd class="text-base font-semibold text-fg">{{ row.value }}</dd>
            <dd class="text-xs text-fg-muted">{{ row.change }}</dd>
          </div>
        </dl>

        <!-- The other lifts that moved, by the size of the move. -->
        <ul v-if="others.length" class="mt-3 divide-y divide-border border-t border-border">
          <li v-for="lift in others" :key="lift.exerciseId ?? lift.exerciseName">
            <component
              :is="liftRoute(lift.exerciseId) ? RouterLink : 'div'"
              :to="liftRoute(lift.exerciseId) ?? undefined"
              class="flex min-h-12 items-center justify-between gap-3 py-2"
            >
              <span class="min-w-0">
                <span class="block truncate text-sm font-medium text-fg">{{
                  lift.exerciseName
                }}</span>
                <span class="block truncate text-xs text-fg-muted">
                  {{ bestLabel(lift.current.best, lift.measure) }}, from
                  {{ bestLabel(lift.previous.best, lift.measure) }}
                </span>
              </span>
              <Chip :tone="deltaTone(lift)" class="shrink-0"
                ><span class="sr-only">{{ direction(lift) }} </span
                >{{ lift.delta === 0 ? 'Same' : deltaLabel(lift) }}</Chip
              >
            </component>
          </li>
        </ul>
        <p v-if="hiddenCount > 0" class="mt-2 text-xs text-fg-muted">
          And {{ hiddenCount }} more under Lifts.
        </p>

        <!-- What was new and what was missed. -->
        <p v-if="comparison.onlyThisWeek.length" class="mt-3 text-xs text-fg-muted">
          New this week:
          {{ comparison.onlyThisWeek.map((lift) => lift.exerciseName).join(', ') }}.
        </p>
        <p v-if="comparison.onlyLastWeek.length" class="mt-1 text-xs text-fg-muted">
          Not this week:
          <template
            v-for="(lift, i) in comparison.onlyLastWeek"
            :key="lift.exerciseId ?? lift.exerciseName"
            >{{ i > 0 ? ', ' : '' }}{{ lift.exerciseName }} ({{
              bestLabel(lift.previous.best, lift.measure)
            }})</template
          >.
        </p>
      </template>
    </template>
  </Card>
</template>
