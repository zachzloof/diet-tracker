<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { areaPath, linePath, makeScale, niceMax, type ChartBox } from '@/lib/chart'

/**
 * A tiny single-series line chart (dataviz skill): a 2 px line with round joins, 8 px
 * markers with a 2 px surface ring, a 10% area wash, an optional solid hairline target,
 * and a tap-or-hover readout. Nulls leave gaps. Built for the week's energy now and the
 * weight trend in slice 5.
 */
const props = withDefaults(
  defineProps<{
    points: (number | null)[]
    labels: string[]
    target?: number | null
    height?: number
    color?: string
    label: string
    unit?: string
    /** Index highlighted with the accent ring (today). */
    highlight?: number | null
  }>(),
  { target: null, height: 140, color: 'var(--accent)', unit: '', highlight: null },
)

const host = ref<HTMLElement | null>(null)
const width = ref(320)
let observer: ResizeObserver | null = null
onMounted(() => {
  if (!host.value) return
  width.value = host.value.clientWidth || 320
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width
      if (next && next > 0) width.value = next
    })
    observer.observe(host.value)
  }
})
onBeforeUnmount(() => observer?.disconnect())

const box = computed<ChartBox>(() => ({
  width: width.value,
  height: props.height,
  left: 12,
  right: 12,
  top: 14,
  bottom: 24,
}))
const max = computed(() => niceMax([...props.points, props.target ?? null]))
const scale = computed(() => makeScale(props.points.length, max.value, box.value))
const line = computed(() => linePath(props.points, scale.value))
const area = computed(() => areaPath(props.points, scale.value))
const markers = computed(() =>
  props.points.flatMap((value, i) =>
    value === null ? [] : [{ i, x: scale.value.x(i), y: scale.value.y(value), value }],
  ),
)
const targetY = computed(() => (props.target === null ? null : scale.value.y(props.target)))
const columnWidth = computed(() =>
  props.points.length > 1
    ? (box.value.width - box.value.left - box.value.right) / (props.points.length - 1)
    : box.value.width,
)

const active = ref<number | null>(null)
const readout = computed(() => {
  const i = active.value
  if (i === null) return null
  const value = props.points[i]
  const label = props.labels[i] ?? ''
  if (value === null || value === undefined) return `${label}: not logged`
  return `${label}: ${Math.round(value).toLocaleString()} ${props.unit}`.trim()
})

function format(value: number): string {
  return Math.round(value).toLocaleString()
}
</script>

<template>
  <div ref="host" class="relative w-full">
    <svg
      :width="width"
      :height="height"
      :viewBox="`0 0 ${width} ${height}`"
      role="img"
      :aria-label="label"
      class="block overflow-visible"
    >
      <!-- Target: a solid hairline in the muted ink, never dashed. -->
      <template v-if="targetY !== null">
        <line
          :x1="box.left"
          :x2="width - box.right"
          :y1="targetY"
          :y2="targetY"
          stroke="var(--fg-muted)"
          stroke-width="1"
          opacity="0.6"
        />
        <text
          :x="width - box.right"
          :y="targetY - 4"
          text-anchor="end"
          font-size="10"
          fill="var(--fg-muted)"
        >
          target {{ format(target ?? 0) }}
        </text>
      </template>

      <path v-if="area" :d="area" :fill="color" opacity="0.1" />
      <path
        v-if="line"
        :d="line"
        fill="none"
        :stroke="color"
        stroke-width="2"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
      <g v-for="m in markers" :key="m.i">
        <circle :cx="m.x" :cy="m.y" r="6" fill="var(--surface)" />
        <circle :cx="m.x" :cy="m.y" r="4" :fill="color" />
        <circle
          v-if="highlight === m.i"
          :cx="m.x"
          :cy="m.y"
          r="8"
          fill="none"
          stroke="var(--accent)"
          stroke-width="1.5"
        />
        <title>{{ labels[m.i] }}: {{ format(m.value) }} {{ unit }}</title>
      </g>

      <text
        v-for="(text, i) in labels"
        :key="i"
        :x="scale.x(i)"
        :y="height - 6"
        text-anchor="middle"
        font-size="11"
        :fill="highlight === i ? 'var(--fg)' : 'var(--fg-muted)'"
        :font-weight="highlight === i ? 600 : 400"
      >
        {{ text }}
      </text>

      <!-- Hit targets: a full-height column per point, wider than the mark. -->
      <rect
        v-for="(_, i) in points"
        :key="`hit-${i}`"
        :x="scale.x(i) - columnWidth / 2"
        y="0"
        :width="columnWidth"
        :height="height"
        fill="transparent"
        @pointerenter="active = i"
        @pointerleave="active = null"
        @click="active = active === i ? null : i"
      />
    </svg>
    <p
      v-if="readout"
      class="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 rounded-control border border-border bg-surface px-2 py-1 text-xs text-fg shadow-card"
      aria-live="polite"
    >
      {{ readout }}
    </p>
  </div>
</template>
