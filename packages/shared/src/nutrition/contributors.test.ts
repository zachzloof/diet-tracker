import { describe, expect, it } from 'vitest'
import { amountOf, contributionsTo, type ContributingEntry } from './contributors.js'
import {
  emptyFoodGroupServes,
  emptyNutrientVector,
  type FoodGroupServes,
  type NutrientVector,
} from './nutrients.js'

interface Entry extends ContributingEntry {
  name: string
}

function entry(
  name: string,
  nutrients: Partial<NutrientVector>,
  foodGroups: Partial<FoodGroupServes> = {},
): Entry {
  return {
    name,
    nutrients: { ...emptyNutrientVector(), ...nutrients },
    foodGroups: { ...emptyFoodGroupServes(), ...foodGroups },
  }
}

/** A day over on saturated fat (limit 20 g) and short on zinc (target 11 mg). */
const day: Entry[] = [
  entry('Porridge with milk', { saturated_fat_g: 3, zinc_mg: 1.8 }, { whole_grains: 1.5 }),
  entry('Butter on toast', { saturated_fat_g: 7.5, zinc_mg: 0.4 }, { whole_grains: 2 }),
  entry('Water', { water_ml: 250 }),
  entry('Cheese sandwich', { saturated_fat_g: 12, zinc_mg: 2.6 }, { dairy_or_alt: 1 }),
  entry('Apple', {}, { fruit: 1 }),
  entry('Flat white', { saturated_fat_g: 3.5, zinc_mg: 0.6 }, { dairy_or_alt: 0.7 }),
]

describe('contributionsTo', () => {
  it('ranks the entries that carry a nutrient, largest first, with their share of the day', () => {
    const sat = contributionsTo(day, 'saturated_fat_g')
    expect(sat.total).toBe(26)
    expect(sat.top.map((c) => c.entry.name)).toEqual([
      'Cheese sandwich',
      'Butter on toast',
      'Flat white',
      'Porridge with milk',
    ])
    expect(sat.top.map((c) => c.amount)).toEqual([12, 7.5, 3.5, 3])
    expect(sat.top[0]?.share).toBeCloseTo(12 / 26, 10)
    expect(sat.top.reduce((sum, c) => sum + c.share, 0)).toBeCloseTo(1, 10)
    expect(sat.rest).toBeNull()
  })

  it('leaves out entries with none of it, such as a glass of water or an apple', () => {
    const zinc = contributionsTo(day, 'zinc_mg')
    expect(zinc.top.map((c) => c.entry.name)).not.toContain('Water')
    expect(zinc.top.map((c) => c.entry.name)).not.toContain('Apple')
    expect(zinc.total).toBeCloseTo(5.4, 10)
    expect(zinc.top[0]?.entry.name).toBe('Cheese sandwich')
  })

  it('reads food groups from the serves, not the nutrients', () => {
    const grains = contributionsTo(day, 'whole_grains')
    expect(grains.total).toBe(3.5)
    expect(grains.top.map((c) => [c.entry.name, c.amount])).toEqual([
      ['Butter on toast', 2],
      ['Porridge with milk', 1.5],
    ])
    const dairy = contributionsTo(day, 'dairy_or_alt')
    expect(dairy.top.map((c) => c.entry.name)).toEqual(['Cheese sandwich', 'Flat white'])
  })

  it('folds everything past the limit into one line', () => {
    const sat = contributionsTo(day, 'saturated_fat_g', 2)
    expect(sat.top.map((c) => c.entry.name)).toEqual(['Cheese sandwich', 'Butter on toast'])
    expect(sat.rest).toEqual({ count: 2, amount: 6.5, share: 6.5 / 26 })
    expect(sat.top.reduce((sum, c) => sum + c.amount, 0) + (sat.rest?.amount ?? 0)).toBe(sat.total)
  })

  it('keeps log order for equal amounts', () => {
    const tied = [entry('First', { iron_mg: 2 }), entry('Second', { iron_mg: 2 })]
    expect(contributionsTo(tied, 'iron_mg').top.map((c) => c.entry.name)).toEqual([
      'First',
      'Second',
    ])
  })

  it('returns an empty breakdown when nothing logged has any', () => {
    expect(contributionsTo(day, 'vitamin_d_ug')).toEqual({ total: 0, top: [], rest: null })
    expect(contributionsTo([], 'zinc_mg')).toEqual({ total: 0, top: [], rest: null })
  })
})

describe('amountOf', () => {
  it('treats a negative or non-finite value as nothing', () => {
    expect(amountOf(entry('Bad', { zinc_mg: -1 }), 'zinc_mg')).toBe(0)
    expect(amountOf(entry('Bad', { zinc_mg: Number.NaN }), 'zinc_mg')).toBe(0)
    expect(amountOf(entry('Good', {}, { legumes: 0.5 }), 'legumes')).toBe(0.5)
  })
})
