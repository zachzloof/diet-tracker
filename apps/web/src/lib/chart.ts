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
  /** y for a value, 0 at the bottom of the plot and `max` at the top. */
  y: (value: number) => number
  plotBottom: number
}

export function makeScale(count: number, max: number, box: ChartBox): ChartScale {
  const plotWidth = box.width - box.left - box.right
  const plotHeight = box.height - box.top - box.bottom
  const step = count > 1 ? plotWidth / (count - 1) : 0
  const safeMax = max > 0 ? max : 1
  return {
    x: (index) => box.left + (count > 1 ? index * step : plotWidth / 2),
    y: (value) => box.top + plotHeight - (Math.max(0, value) / safeMax) * plotHeight,
    plotBottom: box.top + plotHeight,
  }
}

const r1 = (n: number) => Math.round(n * 10) / 10

/** One `M`/`L` run per unbroken stretch of values; nulls leave a gap rather than a line to zero. */
export function linePath(points: readonly (number | null)[], scale: ChartScale): string {
  const parts: string[] = []
  let drawing = false
  points.forEach((value, i) => {
    if (value === null) {
      drawing = false
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
