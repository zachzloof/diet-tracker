/**
 * Geometry for the hand-written SVG charts (mobile-ui skill: no chart library for rings,
 * bars and the tiny line chart). Pure functions so they can be unit-tested.
 */

export interface ChartBox {
  width: number
  height: number
  left: number
  right: number
  top: number
  bottom: number
}

export interface ChartScale {
  /** x for the i-th of `count` evenly spaced points, first at the left edge, last at the right. */
  x: (index: number) => number
  /** y for a value: `min` at the bottom of the plot and `max` at the top. */
  y: (value: number) => number
  plotBottom: number
}

export function makeScale(count: number, max: number, box: ChartBox, min = 0): ChartScale {
  const plotWidth = box.width - box.left - box.right
  const plotHeight = box.height - box.top - box.bottom
  const step = count > 1 ? plotWidth / (count - 1) : 0
  const span = max > min ? max - min : 1
  return {
    x: (index) => box.left + (count > 1 ? index * step : plotWidth / 2),
    y: (value) => box.top + plotHeight - ((Math.max(min, value) - min) / span) * plotHeight,
    plotBottom: box.top + plotHeight,
  }
}

const r1 = (n: number) => Math.round(n * 10) / 10

/**
 * One `M`/`L` run per unbroken stretch of values; nulls leave a gap rather than a line to
 * zero. With `connectNulls` the line skips the gaps instead (a trend through sparse weigh-ins).
 */
export function linePath(
  points: readonly (number | null)[],
  scale: ChartScale,
  connectNulls = false,
): string {
  const parts: string[] = []
  let drawing = false
  points.forEach((value, i) => {
    if (value === null) {
      if (!connectNulls) drawing = false
      return
    }
    parts.push(`${drawing ? 'L' : 'M'}${r1(scale.x(i))} ${r1(scale.y(value))}`)
    drawing = true
  })
  return parts.join(' ')
}

/** Closed shapes under each unbroken stretch, for the 10% area wash. */
export function areaPath(points: readonly (number | null)[], scale: ChartScale): string {
  const parts: string[] = []
  let run: number[] = []
  const flush = () => {
    if (run.length === 0) return
    const first = run[0]!
    const last = run[run.length - 1]!
    const top = run.map((i) => `${r1(scale.x(i))} ${r1(scale.y(points[i] ?? 0))}`).join(' L')
    parts.push(
      `M${r1(scale.x(first))} ${r1(scale.plotBottom)} L${top} L${r1(scale.x(last))} ${r1(scale.plotBottom)} Z`,
    )
    run = []
  }
  points.forEach((value, i) => {
    if (value === null) flush()
    else run.push(i)
  })
  flush()
  return parts.join(' ')
}

/** A top-of-axis value with some headroom, rounded to a clean step for the size of the numbers. */
export function niceMax(values: readonly (number | null)[]): number {
  const max = Math.max(0, ...values.filter((v): v is number => v !== null))
  if (max === 0) return 1
  const padded = max * 1.1
  const magnitude = 10 ** Math.floor(Math.log10(padded))
  const step = magnitude / 2
  return Math.ceil(padded / step) * step
}

/**
 * A y-axis domain hugging the data (a weight trend of 74 to 76 kg should not start at 0):
 * pad the range by a tenth, then snap the edges outward to a clean step.
 */
export function niceDomain(values: readonly (number | null)[]): { min: number; max: number } {
  const present = values.filter((v): v is number => v !== null)
  if (present.length === 0) return { min: 0, max: 1 }
  const lo = Math.min(...present)
  const hi = Math.max(...present)
  const range = hi - lo
  const pad = range > 0 ? range * 0.15 : Math.max(0.5, Math.abs(hi) * 0.02)
  const rawStep = (range > 0 ? range : pad * 2) / 4
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rawStep) ?? magnitude
  return {
    min: Math.floor((lo - pad) / step) * step,
    max: Math.ceil((hi + pad) / step) * step,
  }
}
