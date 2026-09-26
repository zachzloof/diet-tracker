<script setup lang="ts">
import { MIN_REVIEW_DAYS, addDays, summariseWeek } from '@diet-tracker/shared'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AppShell from '@/components/ui/AppShell.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import LineChart from '@/components/ui/LineChart.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import StatTile from '@/components/ui/StatTile.vue'
import { useLocalDay } from '@/features/log/useLocalDay'
import { useRegenerateReview, useWeekStats, useWeeklyReview } from '@/features/stats/useStats'
import { formatDayShort, weekdayShort } from '@/lib/format'
import { useUiStore } from '@/stores/ui'
import DayStrip from './DayStrip.vue'
import GapsList from './GapsList.vue'
import TargetWeekRows from './TargetWeekRows.vue'
import WeeklyReviewCard from './WeeklyReviewCard.vue'

/**
 * Where you stand across the last seven days: days met, streak, a tappable day strip, the
 * energy trend, days met per target, the gaps, and the AI review. Steps back a week at a
 * time; the review is only generated for the current window.
 */
const ui = useUiStore()
const { today } = useLocalDay()

// The window ends today until the person steps back; it follows midnight while on today.
const end = ref(today.value)
watch(today, (next, previous) => {
  if (end.value === previous) end.value = next
})
const isCurrent = computed(() => end.value === today.value)
const rangeLabel = computed(() =>
  isCurrent.value
    ? 'Last 7 days'
    : `${formatDayShort(addDays(end.value, -6))} to ${formatDayShort(end.value)}`,
)

const week = useWeekStats(end)
const stats = week.stats
const summary = computed(() => (stats.value ? summariseWeek(stats.value.days) : null))

const reviewEnabled = computed(
  () =>
    stats.value !== null && !week.isPlaceholder.value && stats.value.daysLogged >= MIN_REVIEW_DAYS,
)
const review = useWeeklyReview(end, reviewEnabled)
const regenerate = useRegenerateReview()
function regenerateReview(): void {
  regenerate.mutate(end.value, { onError: (error) => ui.toast(error.message, 'error') })
}

const energyPoints = computed(() =>
  (stats.value?.days ?? []).map((d) =>
    d.score.logged ? (d.score.scores.energy_kcal?.actual ?? null) : null,
  ),
)
const energyLabels = computed(() => (stats.value?.days ?? []).map((d) => weekdayShort(d.day)))
const energyTarget = computed(() => {
  const days = stats.value?.days ?? []
  for (let i = days.length - 1; i >= 0; i--) {
    const target = days[i]?.score.scores.energy_kcal?.target
    if (target) return target
  }
  return null
})
const todayIndex = computed(() => {
  const days = stats.value?.days ?? []
  const i = days.findIndex((d) => d.day === today.value)
  return i === -1 ? null : i
})
</script>

<template>
  <AppShell title="Week">
    <template #header-right>
      <div class="flex items-center">
        <IconButton label="Previous week" icon="chevron-left" @click="end = addDays(end, -7)" />
        <button
          type="button"
          class="min-w-[6.5rem] text-center text-sm font-semibold text-fg"
          :disabled="isCurrent"
          @click="end = today"
        >
          {{ rangeLabel }}
        </button>
        <IconButton
          label="Next week"
          icon="chevron-right"
          :disabled="isCurrent"
          @click="end = addDays(end, 7) > today ? today : addDays(end, 7)"
        />
      </div>
    </template>

    <div v-if="week.isLoading.value" class="space-y-4" aria-busy="true">
      <div class="grid grid-cols-3 gap-2">
        <Skeleton class="h-20" rounded="card" />
        <Skeleton class="h-20" rounded="card" />
        <Skeleton class="h-20" rounded="card" />
      </div>
      <Skeleton class="h-16 w-full" rounded="card" />
      <Skeleton class="h-44 w-full" rounded="card" />
      <Skeleton class="h-56 w-full" rounded="card" />
    </div>

    <Card v-else-if="week.isError.value">
      <h2 class="text-base font-semibold">Couldn't load your week</h2>
      <p class="mt-1 text-sm text-fg-muted">{{ week.error.value?.message }}</p>
      <Button class="mt-4" variant="secondary" @click="week.refetch()">Try again</Button>
    </Card>

    <div
      v-else-if="stats && summary"
      class="space-y-4 transition-opacity"
      :class="week.isPlaceholder.value && 'opacity-60'"
    >
      <div class="grid grid-cols-3 gap-2">
        <StatTile
          label="Days met"
          :value="stats.daysMet"
          :unit="`/ ${stats.days.length}`"
          :sub="`${stats.daysLogged} logged`"
        />
        <StatTile
          label="Streak"
          :value="stats.streak"
          :unit="stats.streak === 1 ? 'day' : 'days'"
          :sub="stats.streak > 0 ? 'in a row' : 'start today'"
        />
        <StatTile
          label="Nutrients"
          :value="`${Math.round(summary.completeness * 100)}%`"
          sub="of minimums met"
        />
      </div>

      <DayStrip :days="stats.days" :today="stats.today" />

      <Card v-if="stats.daysLogged === 0" :padded="false">
        <EmptyState
          icon="calendar"
          title="No days logged this week"
          description="Log a couple of meals and the trend, the targets and the review appear here."
        >
          <Button @click="ui.openQuickAdd()"><Icon name="plus" :size="20" /> Log food</Button>
        </EmptyState>
      </Card>

      <template v-else>
        <Card>
          <h2 class="flex items-center gap-2 text-base font-semibold">
            <Icon name="flame" :size="20" class="text-accent" />
            Energy by day
          </h2>
          <LineChart
            class="mt-2"
            :points="energyPoints"
            :labels="energyLabels"
            :target="energyTarget"
            :highlight="todayIndex"
            label="Energy eaten each day against the target"
            unit="kcal"
          />
        </Card>

        <TargetWeekRows :days="stats.days" />
      </template>

      <GapsList :gaps="stats.gaps" :days-logged="stats.daysLogged" />

      <WeeklyReviewCard
        v-if="stats.daysLogged > 0"
        :response="review.response.value"
        :loading="review.isLoading.value"
        :regenerating="regenerate.isPending.value"
        :error="review.error.value?.message ?? null"
        :idle="!reviewEnabled && stats.daysLogged >= MIN_REVIEW_DAYS"
        @retry="review.refetch()"
        @regenerate="regenerateReview"
      />

      <Card :padded="false">
        <RouterLink
          :to="{ name: 'history' }"
          class="flex min-h-14 items-center gap-3 px-4 py-3 transition hover:bg-surface-2"
        >
          <span
            class="flex size-10 items-center justify-center rounded-full bg-surface-2 text-fg-muted"
          >
            <Icon name="history" :size="20" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-base font-semibold">History</span>
            <span class="block truncate text-sm text-fg-muted"
              >A month at a glance, a dot per day met</span
            >
          </span>
          <Icon name="chevron-right" :size="18" class="text-fg-muted" />
        </RouterLink>
      </Card>
    </div>
  </AppShell>
</template>
