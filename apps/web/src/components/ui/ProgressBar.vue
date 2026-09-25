<script setup lang="ts">
import { computed } from 'vue'

export type BarColor = 'accent' | 'protein' | 'carbs' | 'fat' | 'fibre' | 'water'

const props = withDefaults(
  defineProps<{
    value: number
    max: number
    color?: BarColor
    label?: string
  }>(),
  { color: 'accent' },
)

const FILL: Record<BarColor, string> = {
  accent: 'bg-accent',
  protein: 'bg-protein',
  carbs: 'bg-carbs',
  fat: 'bg-fat',
  fibre: 'bg-fibre',
  water: 'bg-water',
}

const percent = computed(() =>
  props.max > 0 ? Math.min(100, Math.max(0, (props.value / props.max) * 100)) : 0,
)
</script>

<template>
  <div
    class="h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
    role="progressbar"
    :aria-label="label"
    :aria-valuenow="Math.round(value)"
    aria-valuemin="0"
    :aria-valuemax="Math.round(max)"
  >
    <div
      class="h-full rounded-full transition-[width] duration-250 ease-out"
      :class="FILL[color]"
      :style="{ width: `${percent}%` }"
    />
  </div>
</template>
