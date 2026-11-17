<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { niceMax } from '@/lib/chart'

/**
 * A tiny single-series column chart (dataviz skill): thin columns with a 4 px rounded top
 * anchored to the baseline, a 2 px surface gap between neighbours, an optional solid
 * hairline reference (an average or a target), a tap-or-hover readout per column with a
 * hit target the full height of the plot, and every n-th axis label for dense series.
 * Nulls draw nothing and read as `emptyLabel`. `format` turns a value into the readout's
 * text ("£0.42", "3 sessions"); without it the value is printed with `decimals` and `unit`.
 */
const props = withDefaults(
  defineProps<{
    values: (number | null)[]
    labels: string[]
    label: string
    unit?: string
    decimals?: number
    height?: number
    color?: string
    /** Index drawn at full strength while the others are muted (today, this week). */
    highlight?: number | null
    /** A solid hairline across the plot at this value. */
    reference?: number | null
    referenceLabel?: string
    labelEvery?: number
    emptyLabel?: string
    format?: ((value: number) => string) | null
  }>(),
  {
    unit: '',
    decimals: 0,
    height: 140,
    color: 'var(--accent)',
    highlight: null,
    reference: null,
    referenceLabel: 'average',
    labelEvery: 1,
    emptyLabel: 'none',
    format: null,
  },
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

const PAD = { left: 4, right: 4, top: 14, bottom: 22 }
/** The surface gap between neighbouring columns; dropped when columns get too thin for it. */
const GAP = 2

const max = computed(() => niceMax([...props.values, props.reference]))
const plotWidth = computed(() => Math.max(1, width.value - PAD.left - PAD.right))
const plotHeight = computed(() => props.height - PAD.top - PAD.bottom)
const slot = computed(() => plotWidth.value / Math.max(1, props.values.length))
const gap = computed(() => (slot.value > 6 ? GAP : 0))
const barWidth = computed(() => Math.max(1, Math.min(28, slot.value - gap.value)))
const baseline = computed(() => PAD.top + plotHeight.value)

function y(value: number): number {
  const span = max.value > 0 ? max.value : 1
  return PAD.top + plotHeight.value - (Math.max(0, value) / span) * plotHeight.value
}

const bars = computed(() =>
  props.values.map((value, i) => {
    const centre = PAD.left + slot.value * (i + 0.5)
    const x = centre - barWidth.value / 2
    if (value === null || value <= 0) return { i, x, centre, value, path: '' }
    const top = Math.min(y(value), baseline.value - 1)
    const h = baseline.value - top
    const r = Math.min(4, barWidth.value / 2, h)
    const w = barWidth.value
    // Rounded top corners, square at the baseline.
    const path = `M${x} ${baseline.value} L${x} ${top + r} Q${x} ${top} ${x + r} ${top} L${x + w - r} ${top} Q${x + w} ${top} ${x + w} ${top + r} L${x + w} ${baseline.value} Z`
    return { i, x, centre, value, path }
  }),
)

const referenceY = computed(() =>
  props.reference === null || props.reference <= 0 ? null : y(props.reference),
)

const axisLabels = computed(() =>
  props.labels.map((text, i) => ({
    i,
    text,
    x: PAD.left + slot.value * (i + 0.5),
    show: props.labelEvery <= 1 || (props.labels.length - 1 - i) % props.labelEvery === 0,
  })),
)

const active = ref<number | null>(null)

function show(value: number): string {
  if (props.format) return props.format(value)
  const text = value.toLocaleString(undefined, {
    minimumFractionDigits: props.decimals,
    maximumFractionDigits: props.decimals,
  })
  return `${text} ${props.unit}`.trim()
}

const readout = computed(() => {
  const i = active.value
  if (i === null) return null
  const value = props.values[i]
  const label = props.labels[i] ?? ''
  return value === null || value === undefined || value <= 0
    ? `${label}: ${props.emptyLabel}`
    : `${label}: ${show(value)}`
})

function opacity(i: number): number {
  if (active.value !== null) return active.value === i ? 1 : 0.45
  if (props.highlight === null) return 0.85
  return props.highlight === i ? 1 : 0.55
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
      <line
        :x1="PAD.left"
        :x2="width - PAD.right"
        :y1="baseline"
        :y2="baseline"
        stroke="var(--border)"
        stroke-width="1"
      />
      <path
        v-for="bar in bars"
        v-show="bar.path"
        :key="bar.i"
        :d="bar.path"
        :fill="color"
        :opacity="opacity(bar.i)"
        class="transition-opacity duration-150"
      >
        <title>{{ labels[bar.i] }}: {{ bar.value === null ? emptyLabel : show(bar.value) }}</title>
      </path>

      <template v-if="referenceY !== null">
        <line
          :x1="PAD.left"
          :x2="width - PAD.right"
          :y1="referenceY"
          :y2="referenceY"
          stroke="var(--fg-muted)"
          stroke-width="1"
          opacity="0.6"
        />
        <text
          :x="width - PAD.right"
          :y="referenceY - 4"
          text-anchor="end"
          font-size="10"
          fill="var(--fg-muted)"
        >
          {{ referenceLabel }} {{ show(reference ?? 0) }}
        </text>
      </template>

      <text
        v-for="l in axisLabels"
        v-show="l.show"
        :key="`label-${l.i}`"
        :x="l.x"
        :y="height - 6"
        text-anchor="middle"
        font-size="11"
        :fill="highlight === l.i ? 'var(--fg)' : 'var(--fg-muted)'"
        :font-weight="highlight === l.i ? 600 : 400"
      >
        {{ l.text }}
      </text>

      <rect
        v-for="bar in bars"
        :key="`hit-${bar.i}`"
        :x="PAD.left + slot * bar.i"
        y="0"
        :width="slot"
        :height="height"
        fill="transparent"
        @pointerenter="active = bar.i"
        @pointerleave="active = null"
        @click="active = active === bar.i ? null : bar.i"
      />
    </svg>
    <p
      v-if="readout"
      class="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 rounded-control border border-border bg-surface px-2 py-1 text-xs whitespace-nowrap text-fg shadow-card"
      aria-live="polite"
    >
      {{ readout }}
    </p>
  </div>
</template>
