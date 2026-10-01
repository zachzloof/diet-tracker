import { describe, expect, it } from 'vitest'
import { formatQuantity } from './format'

describe('formatQuantity', () => {
  it('keeps whole numbers whole and trims fractions', () => {
    expect(formatQuantity(4, 'egg')).toBe('4 egg')
    expect(formatQuantity(50, 'g')).toBe('50 g')
    expect(formatQuantity(1.5, 'cup')).toBe('1.5 cup')
    expect(formatQuantity(0.25, 'cup')).toBe('0.25 cup')
    expect(formatQuantity(0.333, 'medium')).toBe('0.33 medium')
  })

  it('puts a times sign before a serving name that carries its own count', () => {
    expect(formatQuantity(1, '1 medium')).toBe('1 × 1 medium')
    expect(formatQuantity(2, '1 scoop')).toBe('2 × 1 scoop')
    expect(formatQuantity(0.5, '4 egg')).toBe('0.5 × 4 egg')
  })
})
