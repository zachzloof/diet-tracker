<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    value: number
    max: number
    size?: number
    stroke?: number
    color?: string
    label?: string
  }>(),
  { size: 160, stroke: 14, color: 'var(--accent)' },
)

const radius = computed(() => (props.size - props.stroke) / 2)
const circumference = computed(() => 2 * Math.PI * radius.value)
const ratio = computed(() =>
  props.max > 0 ? Math.min(1, Math.max(0, props.value / props.max)) : 0,
)

// Animate from 0 on first paint, then from old to new on updates (CSS transition).
const mounted = ref(false)
onMounted(() => {
  requestAnimationFrame(() => (mounted.value = true))
})
const offset = computed(() => circumference.value * (1 - (mounted.value ? ratio.value : 0)))
</script>

<template>
  <div class="relative inline-block" :style="{ width: `${size}px`, height: `${size}px` }">
    <svg
      :width="size"
      :height="size"
      :viewBox="`0 0 ${size} ${size}`"
      role="img"
      :aria-label="label"
    >
      <circle
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        fill="none"
        stroke="var(--surface-2)"
        :stroke-width="stroke"
      />
      <circle
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        fill="none"
        :stroke="color"
        :stroke-width="stroke"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="offset"
        :transform="`rotate(-90 ${size / 2} ${size / 2})`"
        class="transition-[stroke-dashoffset] duration-500 ease-out"
      />
    </svg>
    <div class="absolute inset-0 flex flex-col items-center justify-center">
      <slot />
    </div>
  </div>
</template>
