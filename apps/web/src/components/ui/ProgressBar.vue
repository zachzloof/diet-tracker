<script setup lang="ts">
import { computed } from 'vue'

export type BarColor = 'accent' | 'protein' | 'carbs' | 'fat' | 'fibre' | 'water'

const props = withDefaults(
  defineProps<{
    value: number
    max: number
    color?: BarColor
    label?: string
    /** Still to come (D43): a lighter tone running on from `value`, counted in no number. */
    planned?: number
  }>(),
  { color: 'accent', planned: 0 },
)

const FILL: Record<BarColor, string> = {
  accent: 'bg-accent',
  protein: 'bg-protein',
  carbs: 'bg-carbs',
  fat: 'bg-fat',
  fibre: 'bg-fibre',
  water: 'bg-water',
}

function percentOf(amount: number): number {
  return props.max > 0 ? Math.min(100, Math.max(0, (amount / props.max) * 100)) : 0
}
const percent = computed(() => percentOf(props.value))
const plannedPercent = computed(() => percentOf(props.value + props.planned))
const valueText = computed(() =>
  props.planned > 0
    ? `${Math.round(props.value)} of ${Math.round(props.max)}, plus ${Math.round(props.planned)} planned`
    : undefined,
)
</script>

<template>
  <div
    class="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
    role="progressbar"
    :aria-label="label"
    :aria-valuenow="Math.round(value)"
    :aria-valuetext="valueText"
    aria-valuemin="0"
    :aria-valuemax="Math.round(max)"
  >
    <div
      v-if="planned > 0"
      class="absolute inset-y-0 left-0 rounded-full opacity-35 transition-[width] duration-250 ease-out"
      :class="FILL[color]"
      :style="{ width: `${plannedPercent}%` }"
    />
    <div
      class="relative h-full rounded-full transition-[width] duration-250 ease-out"
      :class="FILL[color]"
      :style="{ width: `${percent}%` }"
    />
  </div>
</template>
