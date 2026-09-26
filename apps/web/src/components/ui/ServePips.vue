<script setup lang="ts">
import { computed } from 'vue'

/**
 * Food-group serves as a row of pips, one per target serve, filled left to right.
 * Fractional serves half-fill a pip; anything past the target is shown by the caller.
 * `decorative` hides it from assistive tech when it sits inside a control whose text
 * already says the numbers (a meter inside a button is flattened anyway).
 */
const props = withDefaults(
  defineProps<{
    value: number
    target: number
    label: string
    color?: 'accent' | 'fibre' | 'carbs'
    decorative?: boolean
  }>(),
  { color: 'accent', decorative: false },
)

const FILL = { accent: 'bg-accent', fibre: 'bg-fibre', carbs: 'bg-carbs' } as const

const pips = computed(() => {
  const count = Math.max(1, Math.ceil(props.target))
  return Array.from({ length: count }, (_, i) => {
    const fill = Math.min(1, Math.max(0, props.value - i))
    return { key: i, percent: Math.round(fill * 100) }
  })
})
</script>

<template>
  <div
    class="flex gap-1"
    :role="decorative ? undefined : 'meter'"
    :aria-label="decorative ? undefined : label"
    :aria-valuenow="decorative ? undefined : Math.round(value * 10) / 10"
    :aria-valuemin="decorative ? undefined : 0"
    :aria-valuemax="decorative ? undefined : target"
    :aria-hidden="decorative ? 'true' : undefined"
  >
    <span
      v-for="pip in pips"
      :key="pip.key"
      class="h-2.5 min-w-3 flex-1 overflow-hidden rounded-full bg-surface-2"
      aria-hidden="true"
    >
      <span
        class="block h-full rounded-full transition-[width] duration-250 ease-out"
        :class="FILL[color]"
        :style="{ width: `${pip.percent}%` }"
      />
    </span>
  </div>
</template>
