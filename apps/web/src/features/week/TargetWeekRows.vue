<script setup lang="ts">
import { summariseTarget, type ScoredDay, type TargetKey } from '@diet-tracker/shared'
import { computed } from 'vue'
import Card from '@/components/ui/Card.vue'
import Icon from '@/components/ui/Icon.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import { formatNumber, targetLabel, unitLabel, weekdayShort } from '@/lib/format'

/** Days met per target, the weekly average against the target, and one status dot per day. */
const props = defineProps<{ days: ScoredDay[] }>()

const KEYS: readonly TargetKey[] = [
  'energy_kcal',
  'protein_g',
  'carbs_g',
  'fat_g',
  'fiber_g',
  'sodium_mg',
  'water_ml',
]

const rows = computed(() =>
  KEYS.map((key) => {
    const week = summariseTarget(props.days, key)
    return {
      key,
      label: targetLabel(key),
      unit: unitLabel(
        key === 'energy_kcal'
          ? 'kcal'
          : key === 'sodium_mg'
            ? 'mg'
            : key === 'water_ml'
              ? 'ml'
              : 'g',
        key,
      ),
      week,
    }
  }),
)

function whole(value: number): string {
  return formatNumber(Math.round(value), 0)
}
</script>

<template>
  <Card>
    <h2 class="flex items-center gap-2 text-base font-semibold">
      <Icon name="target" :size="20" class="text-accent" />
      Targets this week
    </h2>
    <ul class="mt-3 divide-y divide-border">
      <li v-for="row in rows" :key="row.key" class="py-2.5">
        <div class="flex items-baseline justify-between gap-2">
          <span class="text-sm font-medium text-fg">{{ row.label }}</span>
          <span class="text-xs text-fg-muted">
            <span class="font-semibold text-fg">{{ row.week.daysMet }}</span> of
            {{ row.week.daysLogged }} days
          </span>
        </div>
        <div class="mt-1.5 flex items-center justify-between gap-3">
          <span class="text-xs text-fg-muted">
            <template v-if="row.week.average !== null && row.week.target !== null">
              avg <span class="font-semibold text-fg">{{ whole(row.week.average) }}</span> /
              {{ whole(row.week.target) }} {{ row.unit }}
            </template>
            <template v-else>no logged days</template>
          </span>
          <ol class="flex gap-1.5" :aria-label="`${row.label} by day`">
            <li
              v-for="(status, i) in row.week.statuses"
              :key="i"
              :title="`${days[i] ? weekdayShort(days[i]!.day) : ''}: ${status ?? 'not logged'}`"
            >
              <StatusDot :status="status" size="md" />
            </li>
          </ol>
        </div>
      </li>
    </ul>
  </Card>
</template>
