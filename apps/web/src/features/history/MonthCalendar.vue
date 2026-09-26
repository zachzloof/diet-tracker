<script setup lang="ts">
import { daysOfMonth, weekdayIndex, type MonthDay } from '@diet-tracker/shared'
import { computed } from 'vue'
import { formatDay } from '@/lib/format'

/** A Monday-first month grid with a dot per day: met, logged but missed, or nothing. */
const props = defineProps<{ month: string; days: MonthDay[]; today: string }>()
const emit = defineEmits<{ open: [day: string] }>()

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

const cells = computed(() => {
  const byDay = new Map(props.days.map((d) => [d.day, d]))
  const list = daysOfMonth(props.month)
  const lead = list[0] ? weekdayIndex(list[0]) : 0
  const blanks = Array.from({ length: lead }, (_, i) => ({ key: `blank-${i}`, day: null }))
  const dated = list.map((day) => {
    const info = byDay.get(day)
    const future = day > props.today
    const state: 'met' | 'missed' | 'none' = info?.dayMet ? 'met' : info?.logged ? 'missed' : 'none'
    return { key: day, day, future, state, isToday: day === props.today }
  })
  return [...blanks, ...dated]
})

function describe(day: string, state: 'met' | 'missed' | 'none', future: boolean): string {
  if (future) return `${formatDay(day)}, in the future`
  const words = state === 'met' ? 'day met' : state === 'missed' ? 'logged, not met' : 'not logged'
  return `${formatDay(day)}, ${words}. Open this day's log`
}
</script>

<template>
  <div>
    <ol
      class="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-fg-muted"
      aria-hidden="true"
    >
      <li v-for="(w, i) in WEEKDAYS" :key="i">{{ w }}</li>
    </ol>
    <ol class="mt-1 grid grid-cols-7 gap-1">
      <li v-for="cell in cells" :key="cell.key">
        <button
          v-if="cell.day"
          type="button"
          class="flex min-h-12 w-full flex-col items-center justify-center gap-1 rounded-control text-sm text-fg transition disabled:opacity-40"
          :class="[
            cell.isToday
              ? 'border border-accent bg-accent/10 font-semibold'
              : 'hover:bg-surface-2 active:bg-border/40',
          ]"
          :disabled="cell.future"
          :aria-label="describe(cell.day, cell.state, cell.future)"
          :aria-current="cell.isToday ? 'date' : undefined"
          @click="emit('open', cell.day)"
        >
          {{ Number(cell.day.slice(8, 10)) }}
          <span
            class="block size-2 rounded-full"
            :class="
              cell.state === 'met'
                ? 'bg-met'
                : cell.state === 'missed'
                  ? 'border-2 border-short bg-transparent'
                  : 'bg-transparent'
            "
            aria-hidden="true"
          />
        </button>
        <span v-else class="block min-h-12" aria-hidden="true" />
      </li>
    </ol>
    <ul class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted" aria-label="Legend">
      <li class="flex items-center gap-1.5">
        <span class="size-2 rounded-full bg-met" aria-hidden="true" /> Day met
      </li>
      <li class="flex items-center gap-1.5">
        <span class="size-2 rounded-full border-2 border-short" aria-hidden="true" /> Logged, not
        met
      </li>
      <li class="flex items-center gap-1.5">
        <span class="size-2 rounded-full border border-dashed border-border" aria-hidden="true" />
        Not logged
      </li>
    </ul>
  </div>
</template>
