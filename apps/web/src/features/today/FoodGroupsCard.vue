<script setup lang="ts">
import {
  FOOD_GROUPS,
  FOOD_GROUP_KEYS,
  type DayScore,
  type FoodGroupKey,
  type LogEntry,
} from '@diet-tracker/shared'
import { computed, ref, useId } from 'vue'
import Card from '@/components/ui/Card.vue'
import Icon from '@/components/ui/Icon.vue'
import ServePips from '@/components/ui/ServePips.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import { formatNumber } from '@/lib/format'
import ContributorsPanel from './ContributorsPanel.vue'

/**
 * Food-group serves as pips: one per target serve, filled as the day goes. Tap a group to
 * see which of the day's entries supplied it; one group is open at a time.
 */
const props = defineProps<{ score: DayScore; entries: LogEntry[]; isToday: boolean }>()

const rows = computed(() =>
  FOOD_GROUP_KEYS.flatMap((key: FoodGroupKey) => {
    const score = props.score.scores[key]
    if (!score) return []
    return [{ key, label: FOOD_GROUPS[key].label, score, info: score.kind === 'info' }]
  }),
)

const open = ref<FoodGroupKey | null>(null)
const panelId = useId()

function toggle(key: FoodGroupKey): void {
  open.value = open.value === key ? null : key
}

function serves(value: number): string {
  return formatNumber(Math.round(value * 10) / 10, 1)
}
</script>

<template>
  <Card>
    <h2 class="flex items-center gap-2 text-base font-semibold">
      <Icon name="leaf" :size="20" class="text-fibre" />
      Food groups
    </h2>
    <ul class="mt-2">
      <li v-for="row in rows" :key="row.key">
        <button
          type="button"
          class="-mx-2 block w-[calc(100%+1rem)] rounded-control px-2 py-1.5 text-left transition hover:bg-surface-2 active:bg-border/40"
          :aria-expanded="open === row.key"
          :aria-controls="open === row.key ? panelId : undefined"
          @click="toggle(row.key)"
        >
          <span class="flex items-baseline justify-between gap-2 text-sm">
            <span class="font-medium text-fg">{{ row.label }}</span>
            <span class="flex items-center gap-2 text-fg-muted">
              <span>
                <span class="font-semibold text-fg">{{ serves(row.score.actual) }}</span>
                / {{ serves(row.score.target) }}
              </span>
              <StatusDot v-if="!row.info" :status="row.score.status" />
              <span v-else class="text-xs">info</span>
              <Icon
                name="chevron-down"
                :size="16"
                class="self-center transition"
                :class="open === row.key && 'rotate-180'"
              />
            </span>
          </span>
          <ServePips
            class="mt-1.5"
            :value="row.score.actual"
            :target="row.score.target"
            :label="`${row.label}: ${serves(row.score.actual)} of ${serves(row.score.target)} serves`"
            :color="row.info ? 'carbs' : 'fibre'"
            decorative
          />
        </button>
        <ContributorsPanel
          v-if="open === row.key"
          :id="panelId"
          class="mt-1 mb-2"
          :score="row.score"
          :entries="entries"
          unit="serves"
          :is-today="isToday"
        />
      </li>
    </ul>
    <p class="mt-2 text-xs text-fg-muted">
      Tap a group to see where its serves came from. Legumes and nuts are shown for information and
      never scored.
    </p>
  </Card>
</template>
