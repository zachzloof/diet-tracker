<script setup lang="ts">
import type { ScoredDay } from '@diet-tracker/shared'
import { useRouter } from 'vue-router'
import StatusDot from '@/components/ui/StatusDot.vue'
import { formatDay, weekdayShort } from '@/lib/format'

/** Seven tappable days: weekday, date and a met / missed / unlogged dot. Tap opens that day's log. */
defineProps<{ days: ScoredDay[]; today: string }>()

const router = useRouter()

function open(day: string): void {
  void router.push({ name: 'day', params: { day } })
}

function verdict(d: ScoredDay): 'met' | 'short' | null {
  if (!d.score.logged) return null
  return d.score.dayMet ? 'met' : 'short'
}

function describe(d: ScoredDay): string {
  const state = !d.score.logged ? 'not logged' : d.score.dayMet ? 'day met' : 'day not met'
  return `${formatDay(d.day)}, ${state}, open this day's log`
}
</script>

<template>
  <ol class="grid grid-cols-7 gap-1" aria-label="Last seven days">
    <li v-for="d in days" :key="d.day">
      <button
        type="button"
        class="flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-control border py-2 text-fg transition hover:bg-surface-2 active:bg-border/40"
        :class="d.day === today ? 'border-accent bg-accent/10' : 'border-border bg-surface'"
        :aria-current="d.day === today ? 'date' : undefined"
        @click="open(d.day)"
      >
        <span class="text-[11px] font-medium text-fg-muted" aria-hidden="true">{{
          weekdayShort(d.day)
        }}</span>
        <span class="text-sm font-semibold" aria-hidden="true">{{
          Number(d.day.slice(8, 10))
        }}</span>
        <StatusDot :status="verdict(d)" size="md" />
        <span class="sr-only">{{ describe(d) }}</span>
      </button>
    </li>
  </ol>
</template>
