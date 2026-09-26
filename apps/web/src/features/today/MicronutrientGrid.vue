<script setup lang="ts">
import { MICRO_KEYS, NUTRIENTS, type DayScore, type NutrientKey } from '@diet-tracker/shared'
import { computed } from 'vue'
import Card from '@/components/ui/Card.vue'
import Icon from '@/components/ui/Icon.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import { formatNumber } from '@/lib/format'

/**
 * Vitamins and minerals as a grid of small tiles with a met / close / short status, and
 * the limits (sodium, saturated fat, added sugar, alcohol) below them. Every tile carries
 * the status word, so colour is never the only signal.
 */
const props = defineProps<{ score: DayScore }>()

const LIMIT_KEYS: readonly NutrientKey[] = [
  'sodium_mg',
  'saturated_fat_g',
  'added_sugar_g',
  'alcohol_std_drinks',
]

function tiles(keys: readonly NutrientKey[]) {
  return keys.flatMap((key) => {
    const score = props.score.scores[key]
    if (!score) return []
    return [{ key, label: NUTRIENTS[key].label, unit: NUTRIENTS[key].unitLabel, score }]
  })
}
const micros = computed(() => tiles(MICRO_KEYS))
const limits = computed(() => tiles(LIMIT_KEYS))

const TILE: Record<string, string> = {
  met: 'border-met/40 bg-met/10',
  close: 'border-close/40 bg-close/10',
  short: 'border-border bg-transparent',
  over: 'border-over/40 bg-over/10',
  unscored: 'border-border bg-transparent',
}

function amount(value: number): string {
  return formatNumber(value >= 100 ? Math.round(value) : Math.round(value * 10) / 10, 1)
}
function unitShort(unit: string): string {
  return unit.replace(' RAE', '').replace(' DFE', '')
}
const met = computed(
  () => micros.value.filter((t) => t.score.status === 'met' || t.score.status === 'close').length,
)
</script>

<template>
  <Card>
    <div class="flex items-center justify-between gap-2">
      <h2 class="flex items-center gap-2 text-base font-semibold">
        <Icon name="sparkles" :size="20" class="text-carbs" />
        Vitamins and minerals
      </h2>
      <span class="text-xs text-fg-muted">{{ met }} of {{ micros.length }} on track</span>
    </div>
    <ul class="mt-3 grid grid-cols-3 gap-2">
      <li
        v-for="tile in micros"
        :key="tile.key"
        class="min-w-0 rounded-control border px-2 py-2"
        :class="TILE[tile.score.status]"
      >
        <span class="block truncate text-xs font-medium text-fg">{{ tile.label }}</span>
        <span class="mt-0.5 block truncate text-xs text-fg-muted">
          <span class="font-semibold text-fg">{{ amount(tile.score.actual) }}</span>
          / {{ amount(tile.score.target) }} {{ unitShort(tile.unit) }}
        </span>
        <StatusDot class="mt-1" :status="tile.score.status" label />
      </li>
    </ul>

    <h3 class="mt-4 text-sm font-semibold text-fg">Limits</h3>
    <ul class="mt-2 grid grid-cols-2 gap-2">
      <li
        v-for="tile in limits"
        :key="tile.key"
        class="min-w-0 rounded-control border px-2 py-2"
        :class="TILE[tile.score.status]"
      >
        <span class="block truncate text-xs font-medium text-fg">{{ tile.label }}</span>
        <span class="mt-0.5 block truncate text-xs text-fg-muted">
          <span class="font-semibold text-fg">{{ amount(tile.score.actual) }}</span>
          <template v-if="tile.score.target > 0"> / {{ amount(tile.score.target) }}</template>
          {{ tile.unit }}
        </span>
        <StatusDot class="mt-1" :status="tile.score.status" label />
      </li>
    </ul>
    <p class="mt-3 text-xs text-fg-muted">
      Estimates of vitamins and minerals are rough; they never decide whether a day is met.
    </p>
  </Card>
</template>
