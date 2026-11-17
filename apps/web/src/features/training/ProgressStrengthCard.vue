<script setup lang="ts">
import { E1RM_MAX_REPS, mostImproved, type LiftStrength } from '@diet-tracker/shared'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import Card from '@/components/ui/Card.vue'
import Icon from '@/components/ui/Icon.vue'
import { formatDayShort, formatNumber } from '@/lib/format'

/**
 * Strength over the range (`strengthTrends`): the estimated one-rep max of the lifts done
 * most, latest against the first session in the range, with a sparkline of every session.
 * The best mover gets a line of its own. Each row opens the lift's own page.
 */
const props = defineProps<{ lifts: LiftStrength[] }>()

const SHOWN = 6
const top = computed(() => props.lifts.slice(0, SHOWN))
const leader = computed(() => {
  const best = mostImproved(props.lifts)[0]
  return best && (best.changePct ?? 0) > 0 ? best : null
})

function kg(value: number): string {
  return `${formatNumber(value, 1)} kg`
}

function changeText(lift: LiftStrength): string {
  if (lift.changePct === null) return `once, ${formatDayShort(lift.first.day)}`
  const pct = Math.round(lift.changePct * 100)
  const sign = lift.changeKg > 0 ? '+' : lift.changeKg < 0 ? '−' : ''
  return `${sign}${kg(Math.abs(lift.changeKg))} (${sign}${Math.abs(pct)}%) since ${formatDayShort(lift.first.day)}`
}

const SPARK_W = 64
const SPARK_H = 20
/** A sparkline of the session estimates, hugging their own range. */
function spark(lift: LiftStrength): string {
  const values = lift.points.map((point) => point.e1rmKg)
  if (values.length < 2) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  return values
    .map((value, i) => {
      const x = 2 + (i / (values.length - 1)) * (SPARK_W - 4)
      const y = 2 + (1 - (value - min) / span) * (SPARK_H - 4)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}
function lastDot(lift: LiftStrength): { x: number; y: number } | null {
  const values = lift.points.map((point) => point.e1rmKg)
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const last = values[values.length - 1] ?? 0
  return { x: SPARK_W - 2, y: 2 + (1 - (last - min) / (max - min || 1)) * (SPARK_H - 4) }
}
</script>

<template>
  <Card :padded="false">
    <div class="px-4 pt-4">
      <h2 class="flex items-center gap-2 text-base font-semibold">
        <Icon name="trending-up" :size="20" class="text-accent" />
        Strength
      </h2>
      <p class="mt-0.5 text-xs text-fg-muted">
        Estimated one-rep max (Epley: load × (1 + reps ÷ 30)) from your best set of 1 to
        {{ E1RM_MAX_REPS }} reps each session, bodyweight included on bodyweight lifts.
      </p>
      <p
        v-if="leader"
        class="mt-3 flex items-center gap-2 rounded-control bg-accent/10 px-3 py-2 text-sm text-fg"
      >
        <Icon name="award" :size="18" class="shrink-0 text-accent" />
        <span>
          Most improved: <span class="font-semibold">{{ leader.exerciseName }}</span
          >, up {{ Math.round((leader.changePct ?? 0) * 100) }}%
        </span>
      </p>
    </div>
    <p v-if="top.length === 0" class="px-4 pt-3 pb-4 text-sm text-fg-muted">
      No sets with a weight and 1 to {{ E1RM_MAX_REPS }} reps in this range.
    </p>
    <ul v-else class="mt-2 divide-y divide-border">
      <li v-for="lift in top" :key="lift.exerciseId ?? lift.exerciseName">
        <component
          :is="lift.exerciseId ? RouterLink : 'div'"
          v-bind="lift.exerciseId ? { to: { name: 'lift', params: { id: lift.exerciseId } } } : {}"
          class="flex min-h-14 items-center gap-3 px-4 py-2 transition hover:bg-surface-2"
        >
          <span class="min-w-0 flex-1">
            <span class="flex items-baseline justify-between gap-3">
              <span class="min-w-0 truncate text-base font-medium text-fg">{{
                lift.exerciseName
              }}</span>
              <span class="shrink-0 text-base font-semibold text-fg tabular-nums">{{
                kg(lift.latest.e1rmKg)
              }}</span>
            </span>
            <span class="mt-0.5 flex items-center justify-between gap-3">
              <span class="min-w-0 truncate text-xs text-fg-muted">
                {{ changeText(lift) }}
              </span>
              <svg
                v-if="spark(lift)"
                :width="SPARK_W"
                :height="SPARK_H"
                :viewBox="`0 0 ${SPARK_W} ${SPARK_H}`"
                class="shrink-0"
                aria-hidden="true"
              >
                <path
                  :d="spark(lift)"
                  fill="none"
                  stroke="var(--accent)"
                  stroke-width="2"
                  stroke-linejoin="round"
                  stroke-linecap="round"
                />
                <circle
                  v-if="lastDot(lift)"
                  :cx="lastDot(lift)?.x"
                  :cy="lastDot(lift)?.y"
                  r="2.5"
                  fill="var(--accent)"
                />
              </svg>
            </span>
          </span>
          <Icon
            v-if="lift.exerciseId"
            name="chevron-right"
            :size="18"
            class="shrink-0 text-fg-muted"
          />
        </component>
      </li>
    </ul>
    <p v-if="lifts.length > SHOWN" class="px-4 pt-1 pb-3 text-xs text-fg-muted">
      Your {{ SHOWN }} most-trained lifts. Every exercise is under
      <RouterLink :to="{ name: 'lifts' }" class="font-medium text-accent underline"
        >Lifts</RouterLink
      >.
    </p>
    <div v-else class="h-2" />
  </Card>
</template>
