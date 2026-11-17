<script setup lang="ts">
import type { CalendarDay, WeekStreaks } from '@diet-tracker/shared'
import { computed } from 'vue'
import BarChart from '@/components/ui/BarChart.vue'
import Card from '@/components/ui/Card.vue'
import Icon from '@/components/ui/Icon.vue'
import { formatDayShort } from '@/lib/format'

/**
 * How steady the training has been: weeks in a row with a session (`weekStreaks`), the range
 * as a calendar (`trainingCalendar`: weeks as columns, Monday at the top, the accent stepped
 * by how many sets that day held against the busiest day), and sessions by weekday.
 */
const props = defineProps<{
  streaks: WeekStreaks
  calendar: CalendarDay[][]
  weekdays: number[]
  daysTrained: number
  days: number
}>()

const LEVEL_CLASS = ['bg-surface-2', 'bg-accent/30', 'bg-accent/55', 'bg-accent/80', 'bg-accent']
/** Cells shrink to fit a year (53 columns) in a phone's width, and stop growing at 14 px. */
const gap = computed(() => (props.calendar.length > 30 ? 1.5 : 3))
const gridStyle = computed(() => ({
  gridTemplateColumns: `auto repeat(${props.calendar.length}, minmax(0, 14px))`,
  gap: `${gap.value}px`,
}))
const ROW_LABELS = ['M', '', 'W', '', 'F', '', 'S']
const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const WEEKDAY_NAMES = [
  'Mondays',
  'Tuesdays',
  'Wednesdays',
  'Thursdays',
  'Fridays',
  'Saturdays',
  'Sundays',
]

function cellTitle(day: CalendarDay): string {
  if (!day.inWindow) return ''
  if (day.sessions === 0) return `${formatDayShort(day.day)}: rest`
  const sessions = day.sessions === 1 ? '1 session' : `${day.sessions} sessions`
  const sets = day.workingSets === 1 ? '1 set' : `${day.workingSets} sets`
  return `${formatDayShort(day.day)}: ${sessions}, ${sets}`
}

const favourite = computed(() => {
  const most = Math.max(...props.weekdays)
  if (most <= 0) return null
  const i = props.weekdays.indexOf(most)
  return WEEKDAY_NAMES[i] ?? null
})
const restDays = computed(() => props.days - props.daysTrained)

function weeks(n: number): string {
  return n === 1 ? '1 week' : `${n} weeks`
}
</script>

<template>
  <Card>
    <h2 class="flex items-center gap-2 text-base font-semibold">
      <Icon name="flame" :size="20" class="text-accent" />
      Consistency
    </h2>

    <dl class="mt-3 grid grid-cols-3 gap-2 text-center">
      <div class="rounded-control bg-surface-2 px-2 py-2">
        <dt class="text-xs text-fg-muted">Streak</dt>
        <dd class="text-xl font-bold text-fg">{{ weeks(streaks.current) }}</dd>
      </div>
      <div class="rounded-control bg-surface-2 px-2 py-2">
        <dt class="text-xs text-fg-muted">Longest</dt>
        <dd class="text-xl font-bold text-fg">{{ weeks(streaks.longest) }}</dd>
      </div>
      <div class="rounded-control bg-surface-2 px-2 py-2">
        <dt class="text-xs text-fg-muted">Days trained</dt>
        <dd class="text-xl font-bold text-fg">{{ daysTrained }}</dd>
      </div>
    </dl>
    <p class="mt-2 text-xs text-fg-muted">
      A streak is weeks in a row with at least one finished session.
      <template v-if="!streaks.thisWeek && streaks.current > 0">
        Train this week to keep it going.
      </template>
    </p>

    <div
      class="mt-4 grid grid-flow-col grid-rows-7"
      :style="gridStyle"
      role="img"
      :aria-label="`Training calendar: ${daysTrained} days trained and ${restDays} rest days in the range`"
    >
      <span
        v-for="(label, i) in ROW_LABELS"
        :key="`row-${i}`"
        class="flex items-center pr-1 text-[10px] leading-none text-fg-muted"
        aria-hidden="true"
        >{{ label }}</span
      >
      <template v-for="column in calendar" :key="column[0]?.day">
        <span
          v-for="day in column"
          :key="day.day"
          class="aspect-square rounded-[3px]"
          :class="day.inWindow ? LEVEL_CLASS[day.level] : 'bg-transparent'"
          :title="cellTitle(day)"
        />
      </template>
    </div>
    <div
      class="mt-2 flex items-center justify-end gap-1 text-[11px] text-fg-muted"
      aria-hidden="true"
    >
      Fewer sets
      <span v-for="(cls, i) in LEVEL_CLASS" :key="i" class="size-2.5 rounded-[3px]" :class="cls" />
      More
    </div>

    <h3 class="mt-4 text-sm font-semibold text-fg">Sessions by weekday</h3>
    <p v-if="favourite" class="text-xs text-fg-muted">You train most on {{ favourite }}.</p>
    <BarChart
      class="mt-1"
      :values="weekdays"
      :labels="WEEKDAY_LABELS"
      label="Finished sessions by day of the week, Monday first"
      :height="100"
      :format="(v: number) => (v === 1 ? '1 session' : `${v} sessions`)"
      empty-label="no sessions"
    />
  </Card>
</template>
