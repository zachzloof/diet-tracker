import { describe, expect, it } from 'vitest'
import { areaPath, linePath, makeScale, niceMax, type ChartBox } from './chart'

const box: ChartBox = { width: 120, height: 60, left: 10, right: 10, top: 10, bottom: 10 }

describe('makeScale', () => {
  it('spreads points from the left edge to the right edge and maps 0 to the bottom', () => {
    const scale = makeScale(3, 100, box)
    expect(scale.x(0)).toBe(10)
    expect(scale.x(1)).toBe(60)
    expect(scale.x(2)).toBe(110)
    expect(scale.y(0)).toBe(50)
    expect(scale.y(100)).toBe(10)
    expect(scale.y(50)).toBe(30)
    expect(scale.plotBottom).toBe(50)
  })

  it('centres a single point and survives a zero max', () => {
    const scale = makeScale(1, 0, box)
    expect(scale.x(0)).toBe(60)
    expect(scale.y(0)).toBe(50)
  })
})

describe('linePath and areaPath', () => {
  const scale = makeScale(5, 100, box)

  it('draws one run for a full series', () => {
    expect(linePath([0, 50, 100, 50, 0], scale)).toBe('M10 50 L35 30 L60 10 L85 30 L110 50')
  })

  it('breaks the line at a null instead of dropping to zero', () => {
    expect(linePath([0, 50, null, 50, 0], scale)).toBe('M10 50 L35 30 M85 30 L110 50')
    expect(linePath([null, null, null, null, null], scale)).toBe('')
  })

  it('closes one area per run down to the baseline', () => {
    expect(areaPath([0, 50, null, 100, 100], scale)).toBe(
      'M10 50 L10 50 L35 30 L35 50 Z M85 50 L85 10 L110 10 L110 50 Z',
    )
  })
})

describe('niceMax', () => {
  it('adds headroom and rounds to a clean step', () => {
    expect(niceMax([3250, 2700])).toBe(4000)
    expect(niceMax([150, 120])).toBe(200)
    expect(niceMax([45])).toBe(50)
    expect(niceMax([null, 0])).toBe(1)
    expect(niceMax([])).toBe(1)
  })
})
