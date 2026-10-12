<script setup lang="ts">
import { useRouter } from 'vue-router'
import { formatDay, weekdayShort } from '@/lib/format'

/** Seven tappable days with a dot on each one trained. Tap opens that day in the gym half. */
defineProps<{ days: { day: string; sessions: number }[]; today: string }>()

const router = useRouter()

function open(day: string): void {
  void router.push({ name: 'gym-day', params: { day } })
}

function describe(d: { day: string; sessions: number }): string {
  const state =
    d.sessions === 0 ? 'rest day' : d.sessions === 1 ? '1 session' : `${d.sessions} sessions`
  return `${formatDay(d.day)}, ${state}, open this day`
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
        <span
          class="size-3 rounded-full"
          :class="d.sessions > 0 ? 'bg-met' : 'border border-dashed border-border'"
          aria-hidden="true"
        />
        <span class="sr-only">{{ describe(d) }}</span>
      </button>
    </li>
  </ol>
</template>
