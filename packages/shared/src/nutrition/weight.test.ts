import { describe, expect, it } from 'vitest'
import { normaliseWeights, weightRate, weightTrend, weightsBetween } from './weight.js'

describe('normaliseWeights', () => {
  it('sorts by day and keeps the last weigh-in for a repeated day', () => {
    expect(
      normaliseWeights([
        { day: '2026-09-03', weightKg: 75.4 },
        { day: '2026-09-01', weightKg: 75 },
        { day: '2026-09-03', weightKg: 75.2 },
      ]),
    ).toEqual([
      { day: '2026-09-01', weightKg: 75 },
      { day: '2026-09-03', weightKg: 75.2 },
    ])
  })
})

describe('weightTrend', () => {
  it('averages the weigh-ins in the trailing seven days, inclusive', () => {
    const trend = weightTrend([
      { day: '2026-09-01', weightKg: 76 },
      { day: '2026-09-04', weightKg: 75 },
      { day: '2026-09-07', weightKg: 74 }, // 1st is 6 days back: still inside the window
      { day: '2026-09-08', weightKg: 75 }, // 1st is 7 days back: dropped
    ])
    expect(trend.map((t) => t.trendKg)).toEqual([76, 75.5, 75, 74.67])
  })

  it('smooths a noisy series', () => {
    const points = [75.8, 74.9, 75.6, 75.1, 75.4, 75.0, 75.3].map((weightKg, i) => ({
      day: `2026-09-${String(i + 1).padStart(2, '0')}`,
      weightKg,
    }))
    const trend = weightTrend(points)
    expect(trend[6]?.trendKg).toBe(75.3)
    expect(
      Math.max(...trend.map((t) => t.trendKg)) - Math.min(...trend.map((t) => t.trendKg)),
    ).toBeLessThan(0.6)
  })
})

describe('weightRate', () => {
  it('is null with one point or a span under a week', () => {
    expect(weightRate(weightTrend([{ day: '2026-09-01', weightKg: 75 }]))).toBeNull()
    expect(
      weightRate(
        weightTrend([
          { day: '2026-09-01', weightKg: 75 },
          { day: '2026-09-06', weightKg: 74 },
        ]),
      ),
    ).toBeNull()
  })

  it('reports kg per week between the first and last trend points', () => {
    const rate = weightRate(
      weightTrend([
        { day: '2026-09-01', weightKg: 75 },
        { day: '2026-09-08', weightKg: 75 },
        { day: '2026-09-15', weightKg: 74.5 },
      ]),
    )
    expect(rate).not.toBeNull()
    expect(rate?.spanDays).toBe(14)
    expect(rate?.kgPerWeek).toBe(-0.25)
  })

  it('a flat fortnight is a rate of zero', () => {
    const points = [0, 2, 4, 6, 8, 10, 12].map((offset) => ({
      day: `2026-09-${String(1 + offset).padStart(2, '0')}`,
      weightKg: 50 + (offset % 4 === 0 ? 0.1 : -0.1),
    }))
    const rate = weightRate(weightTrend(points))
    expect(rate?.spanDays).toBe(12)
    expect(Math.abs(rate?.kgPerWeek ?? 1)).toBeLessThan(0.1)
  })
})

describe('weightsBetween', () => {
  it('keeps the inclusive range only', () => {
    const points = [
      { day: '2026-08-31', weightKg: 1 },
      { day: '2026-09-01', weightKg: 2 },
      { day: '2026-09-14', weightKg: 3 },
      { day: '2026-09-15', weightKg: 4 },
    ]
    expect(weightsBetween(points, '2026-09-01', '2026-09-14').map((p) => p.weightKg)).toEqual([
      2, 3,
    ])
  })
})
