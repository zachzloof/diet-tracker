import { z } from 'zod'
import { daysBetween } from '../dates.js'

/**
 * Weight trend math (slice 5). Body weight swings a kilo day to day with water and food,
 * so nothing here reads a single weigh-in: the trend is a trailing seven-day average and
 * the rate of change compares the first and last trend points. Pure; the Progress screen
 * and the recalibration rule both use it.
 */

export const weightPointSchema = z.object({
  day: z.iso.date(),
  weightKg: z.number().positive(),
})
export type WeightPoint = z.infer<typeof weightPointSchema>

export interface TrendPoint extends WeightPoint {
  /** Mean of the weigh-ins in the `TREND_WINDOW_DAYS` days ending on this day, inclusive. */
  trendKg: number
}

export const TREND_WINDOW_DAYS = 7

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** Sorts ascending by day and keeps the last weigh-in when a day appears twice. */
export function normaliseWeights(points: readonly WeightPoint[]): WeightPoint[] {
  const byDay = new Map<string, number>()
  for (const point of points) byDay.set(point.day, point.weightKg)
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, weightKg]) => ({ day, weightKg }))
}

/** One trend value per weigh-in: the trailing average over the window ending that day. */
export function weightTrend(
  points: readonly WeightPoint[],
  windowDays: number = TREND_WINDOW_DAYS,
): TrendPoint[] {
  const sorted = normaliseWeights(points)
  return sorted.map((point, index) => {
    let sum = 0
    let count = 0
    for (let i = index; i >= 0; i--) {
      const earlier = sorted[i]!
      if (daysBetween(earlier.day, point.day) >= windowDays) break
      sum += earlier.weightKg
      count += 1
    }
    return { ...point, trendKg: round2(sum / count) }
  })
}

export interface WeightRate {
  /** Positive means gaining. */
  kgPerWeek: number
  spanDays: number
  from: TrendPoint
  to: TrendPoint
}

/**
 * The rate of change between the first and last trend points, in kg per week, or null when
 * the weigh-ins span fewer than `minSpanDays` days (a two-day window says nothing).
 */
export function weightRate(
  trend: readonly TrendPoint[],
  minSpanDays: number = TREND_WINDOW_DAYS,
): WeightRate | null {
  const from = trend[0]
  const to = trend[trend.length - 1]
  if (!from || !to || from === to) return null
  const spanDays = daysBetween(from.day, to.day)
  if (spanDays < minSpanDays) return null
  return {
    kgPerWeek: round2(((to.trendKg - from.trendKg) / spanDays) * 7),
    spanDays,
    from,
    to,
  }
}

/** The weigh-ins with a day inside [start, end], inclusive. */
export function weightsBetween(
  points: readonly WeightPoint[],
  start: string,
  end: string,
): WeightPoint[] {
  return normaliseWeights(points).filter((point) => point.day >= start && point.day <= end)
}
