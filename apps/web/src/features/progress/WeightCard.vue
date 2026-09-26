<script setup lang="ts">
import { daysBetween, weightTrend, type WeightEntry } from '@diet-tracker/shared'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useProfile } from '@/features/profile/useProfile'
import { formatDay, formatWeight } from '@/lib/format'
import WeightSheet from './WeightSheet.vue'
import { useWeights } from './useProgress'

/** Today's weight card: the latest weigh-in, the trend over the last week, and a quick entry. */
const props = defineProps<{ today: string }>()

const profile = useProfile()
const weights = useWeights(28)
const sheetOpen = ref(false)

const units = computed(() => profile.profile.value?.units ?? 'metric')
const entries = computed(() => weights.data.value?.entries ?? [])
const latest = computed<WeightEntry | null>(() => entries.value[entries.value.length - 1] ?? null)
const trend = computed(() => weightTrend(entries.value))
const trendNow = computed(() => trend.value[trend.value.length - 1] ?? null)
/** The trend point at least a week before the latest one, for "down 0.3 kg this week". */
const trendWeekAgo = computed(() => {
  const now = trendNow.value
  if (!now) return null
  return [...trend.value].reverse().find((p) => daysBetween(p.day, now.day) >= 7) ?? null
})
const weekChange = computed(() =>
  trendNow.value && trendWeekAgo.value ? trendNow.value.trendKg - trendWeekAgo.value.trendKg : null,
)
const changeText = computed(() => {
  const change = weekChange.value
  if (change === null) return 'Weigh in a few times a week to see your trend.'
  if (Math.abs(change) < 0.05) return 'Trend steady over the last week.'
  const amount = formatWeight(Math.abs(change), units.value)
  return `Trend ${change > 0 ? 'up' : 'down'} ${amount} over the last week.`
})
const latestLabel = computed(() => {
  if (!latest.value) return ''
  if (latest.value.day === props.today) return 'today'
  const days = daysBetween(latest.value.day, props.today)
  return days === 1 ? 'yesterday' : days < 7 ? `${days} days ago` : formatDay(latest.value.day)
})
</script>

<template>
  <Card>
    <div class="flex items-center justify-between gap-2">
      <h2 class="flex items-center gap-2 text-base font-semibold">
        <Icon name="scale" :size="20" class="text-accent" />
        Weight
      </h2>
      <RouterLink
        :to="{ name: 'progress' }"
        class="flex items-center gap-1 text-sm font-semibold text-accent"
      >
        Progress <Icon name="chevron-right" :size="16" />
      </RouterLink>
    </div>

    <div v-if="weights.isLoading.value" class="mt-2 space-y-2" aria-busy="true">
      <Skeleton class="h-8 w-32" />
      <Skeleton class="h-4 w-48" />
    </div>
    <template v-else-if="latest">
      <div class="mt-2 flex items-baseline gap-2">
        <span class="text-[28px] leading-none font-bold text-fg">
          {{ formatWeight(latest.weightKg, units) }}
        </span>
        <span class="text-sm text-fg-muted">{{ latestLabel }}</span>
      </div>
      <p class="mt-1 text-sm text-fg-muted">{{ changeText }}</p>
    </template>
    <p v-else class="mt-2 text-sm text-fg-muted">
      No weigh-ins yet. Log one and the trend against your goal appears under Progress.
    </p>

    <Button class="mt-3" block variant="secondary" @click="sheetOpen = true">
      <Icon name="plus" :size="20" /> Log weight
    </Button>

    <WeightSheet v-model:open="sheetOpen" :today="today" :latest="latest" />
  </Card>
</template>
