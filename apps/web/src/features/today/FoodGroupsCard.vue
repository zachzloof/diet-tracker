<script setup lang="ts">
import {
  FOOD_GROUPS,
  FOOD_GROUP_KEYS,
  type DayScore,
  type FoodGroupKey,
} from '@diet-tracker/shared'
import { computed } from 'vue'
import Card from '@/components/ui/Card.vue'
import Icon from '@/components/ui/Icon.vue'
import ServePips from '@/components/ui/ServePips.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import { formatNumber } from '@/lib/format'

/** Food-group serves as pips: one per target serve, filled as the day goes. */
const props = defineProps<{ score: DayScore }>()

const rows = computed(() =>
  FOOD_GROUP_KEYS.flatMap((key: FoodGroupKey) => {
    const score = props.score.scores[key]
    if (!score) return []
    return [{ key, label: FOOD_GROUPS[key].label, score, info: score.kind === 'info' }]
  }),
)

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
    <ul class="mt-3 space-y-3">
      <li v-for="row in rows" :key="row.key">
        <div class="flex items-baseline justify-between gap-2 text-sm">
          <span class="font-medium text-fg">{{ row.label }}</span>
          <span class="flex items-center gap-2 text-fg-muted">
            <span>
              <span class="font-semibold text-fg">{{ serves(row.score.actual) }}</span>
              / {{ serves(row.score.target) }}
            </span>
            <StatusDot v-if="!row.info" :status="row.score.status" />
            <span v-else class="text-xs">info</span>
          </span>
        </div>
        <ServePips
          class="mt-1.5"
          :value="row.score.actual"
          :target="row.score.target"
          :label="`${row.label}: ${serves(row.score.actual)} of ${serves(row.score.target)} serves`"
          :color="row.info ? 'carbs' : 'fibre'"
        />
      </li>
    </ul>
    <p class="mt-3 text-xs text-fg-muted">
      Legumes and nuts are shown for information and never scored.
    </p>
  </Card>
</template>
