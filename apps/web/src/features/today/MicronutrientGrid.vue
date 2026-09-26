<script setup lang="ts">
import {
  MICRO_KEYS,
  NUTRIENTS,
  type DayScore,
  type LogEntry,
  type NutrientKey,
} from '@diet-tracker/shared'
import { computed, ref, useId } from 'vue'
import Card from '@/components/ui/Card.vue'
import Icon from '@/components/ui/Icon.vue'
import { formatNumber } from '@/lib/format'
import ContributorsPanel from './ContributorsPanel.vue'
import NutrientTile from './NutrientTile.vue'

/**
 * Vitamins and minerals as a grid of small tiles with a met / close / short status, and
 * the limits (sodium, saturated fat, added sugar, alcohol) below them. Every tile carries
 * the status word, so colour is never the only signal. Tap a tile to open, under its row,
 * the entries that supplied it; one tile is open at a time across both grids.
 */
const props = defineProps<{ score: DayScore; entries: LogEntry[]; isToday: boolean }>()

const LIMIT_KEYS: readonly NutrientKey[] = [
  'sodium_mg',
  'saturated_fat_g',
  'added_sugar_g',
  'alcohol_std_drinks',
]
const MICRO_COLUMNS = 3
const LIMIT_COLUMNS = 2

function unitShort(unit: string): string {
  return unit.replace(' RAE', '').replace(' DFE', '')
}

function tiles(keys: readonly NutrientKey[]) {
  return keys.flatMap((key) => {
    const score = props.score.scores[key]
    if (!score) return []
    const unit = NUTRIENTS[key].unitLabel
    return [{ key, label: NUTRIENTS[key].label, unit, short: unitShort(unit), score }]
  })
}
const micros = computed(() => tiles(MICRO_KEYS))
const limits = computed(() => tiles(LIMIT_KEYS))

const open = ref<NutrientKey | null>(null)
const panelId = useId()

function toggle(key: NutrientKey): void {
  open.value = open.value === key ? null : key
}

/** The open tile and where its panel goes: after the last tile in its row, spanning the grid. */
const panel = computed(() => {
  const grids = [
    { grid: 'micros', list: micros.value, columns: MICRO_COLUMNS },
    { grid: 'limits', list: limits.value, columns: LIMIT_COLUMNS },
  ] as const
  for (const { grid, list, columns } of grids) {
    const index = list.findIndex((tile) => tile.key === open.value)
    const tile = list[index]
    if (!tile) continue
    const after = Math.min((Math.floor(index / columns) + 1) * columns, list.length) - 1
    return { grid, tile, after }
  }
  return null
})

function amount(value: number): string {
  return formatNumber(value >= 100 ? Math.round(value) : Math.round(value * 10) / 10, 1)
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
      <template v-for="(tile, index) in micros" :key="tile.key">
        <li class="min-w-0">
          <NutrientTile
            :label="tile.label"
            :status="tile.score.status"
            :open="open === tile.key"
            :controls="panelId"
            @toggle="toggle(tile.key)"
          >
            <span class="font-semibold text-fg">{{ amount(tile.score.actual) }}</span>
            / {{ amount(tile.score.target) }} {{ tile.short }}
          </NutrientTile>
        </li>
        <li v-if="panel?.grid === 'micros' && panel.after === index" class="col-span-3">
          <ContributorsPanel
            :id="panelId"
            :score="panel.tile.score"
            :entries="entries"
            :unit="panel.tile.short"
            :is-today="isToday"
          />
        </li>
      </template>
    </ul>

    <h3 class="mt-4 text-sm font-semibold text-fg">Limits</h3>
    <ul class="mt-2 grid grid-cols-2 gap-2">
      <template v-for="(tile, index) in limits" :key="tile.key">
        <li class="min-w-0">
          <NutrientTile
            :label="tile.label"
            :status="tile.score.status"
            :open="open === tile.key"
            :controls="panelId"
            @toggle="toggle(tile.key)"
          >
            <span class="font-semibold text-fg">{{ amount(tile.score.actual) }}</span>
            <template v-if="tile.score.target > 0"> / {{ amount(tile.score.target) }}</template>
            {{ tile.unit }}
          </NutrientTile>
        </li>
        <li v-if="panel?.grid === 'limits' && panel.after === index" class="col-span-2">
          <ContributorsPanel
            :id="panelId"
            :score="panel.tile.score"
            :entries="entries"
            :unit="panel.tile.short"
            :is-today="isToday"
          />
        </li>
      </template>
    </ul>
    <p class="mt-3 text-xs text-fg-muted">
      Tap a tile to see which foods it came from. Estimates of vitamins and minerals are rough; they
      never decide whether a day is met.
    </p>
  </Card>
</template>
