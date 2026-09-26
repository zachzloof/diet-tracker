import { describe, expect, it } from 'vitest'
import { emptyFoodGroupServes, emptyNutrientVector } from './nutrients.js'
import {
  gramsForServings,
  portionOf,
  referenceGrams,
  rescaleToGrams,
  rescaleToQuantity,
  sanitiseNutrientVector,
  sumPortions,
  type PortionSource,
} from './portions.js'

/** Rolled oats per 100 g, roughly. */
const oats: PortionSource = {
  basis: 'per_100g',
  servingGrams: null,
  nutrients: { ...emptyNutrientVector(), energy_kcal: 380, protein_g: 13, carbs_g: 60, fat_g: 7 },
  foodGroups: { ...emptyFoodGroupServes(), whole_grains: 3.3 },
}

/** A protein shake per 1 serving of 35 g powder. */
const shake: PortionSource = {
  basis: 'per_serving',
  servingGrams: 35,
  nutrients: { ...emptyNutrientVector(), energy_kcal: 130, protein_g: 25, carbs_g: 3, fat_g: 2 },
  foodGroups: { ...emptyFoodGroupServes(), dairy_or_alt: 0.5 },
}

describe('portionOf', () => {
  it('scales a per-100g food to the grams eaten', () => {
    const portion = portionOf(oats, 50)
    expect(portion.nutrients.energy_kcal).toBe(190)
    expect(portion.nutrients.protein_g).toBe(6.5)
    expect(portion.foodGroups.whole_grains).toBeCloseTo(1.65)
  })

  it('scales a per-serving food by its serving grams', () => {
    const portion = portionOf(shake, 70)
    expect(portion.nutrients.energy_kcal).toBe(260)
    expect(portion.nutrients.protein_g).toBe(50)
    expect(portion.foodGroups.dairy_or_alt).toBe(1)
  })

  it('returns zeros for zero grams and refuses negatives', () => {
    expect(portionOf(oats, 0).nutrients.energy_kcal).toBe(0)
    expect(() => portionOf(oats, -1)).toThrow()
  })

  it('refuses a per-serving food without serving grams', () => {
    expect(() => referenceGrams({ basis: 'per_serving', servingGrams: null })).toThrow()
    expect(referenceGrams(oats)).toBe(100)
    expect(referenceGrams(shake)).toBe(35)
  })
})

describe('gramsForServings', () => {
  it('uses 100 g as the serving for per-100g foods', () => {
    expect(gramsForServings(oats, 0.5)).toBe(50)
    expect(gramsForServings(shake, 2)).toBe(70)
  })
})

describe('rescaleToQuantity', () => {
  const fourEggs = {
    quantity: 4,
    grams: 200,
    nutrients: { ...emptyNutrientVector(), energy_kcal: 300, protein_g: 26, fat_g: 20 },
    foodGroups: { ...emptyFoodGroupServes(), protein_foods: 2 },
    name: 'Egg, whole, large, boiled',
  }

  it('scales grams, nutrients and serves with the quantity and keeps other fields', () => {
    const three = rescaleToQuantity(fourEggs, 3)
    expect(three.quantity).toBe(3)
    expect(three.grams).toBe(150)
    expect(three.nutrients.energy_kcal).toBe(225)
    expect(three.nutrients.protein_g).toBe(19.5)
    expect(three.foodGroups.protein_foods).toBe(1.5)
    expect(three.name).toBe(fourEggs.name)
    expect(fourEggs.quantity).toBe(4)
  })

  it('refuses a negative quantity and leaves a zero-quantity item alone', () => {
    expect(() => rescaleToQuantity(fourEggs, -1)).toThrow()
    const zero = { ...fourEggs, quantity: 0 }
    expect(rescaleToQuantity(zero, 2).grams).toBe(200)
  })
})

describe('rescaleToGrams', () => {
  const fourEggs = {
    quantity: 4,
    grams: 200,
    nutrients: { ...emptyNutrientVector(), energy_kcal: 300, protein_g: 26, fat_g: 20 },
    foodGroups: { ...emptyFoodGroupServes(), protein_foods: 2 },
    name: 'Egg, whole, large, boiled',
  }

  it('scales quantity, nutrients and serves with the grams and keeps other fields', () => {
    const smaller = rescaleToGrams(fourEggs, 150)
    expect(smaller.grams).toBe(150)
    expect(smaller.quantity).toBe(3)
    expect(smaller.nutrients.energy_kcal).toBe(225)
    expect(smaller.nutrients.protein_g).toBe(19.5)
    expect(smaller.foodGroups.protein_foods).toBe(1.5)
    expect(smaller.name).toBe(fourEggs.name)
    expect(fourEggs.grams).toBe(200)
  })

  it('agrees with rescaleToQuantity for the same change', () => {
    const byGrams = rescaleToGrams(fourEggs, 250)
    const byQuantity = rescaleToQuantity(fourEggs, 5)
    expect(byGrams.quantity).toBeCloseTo(byQuantity.quantity)
    expect(byGrams.nutrients).toEqual(byQuantity.nutrients)
  })

  it('goes to zero and back when scaling from the original each time', () => {
    const zero = rescaleToGrams(fourEggs, 0)
    expect(zero.nutrients.energy_kcal).toBe(0)
    expect(zero.quantity).toBe(0)
    expect(rescaleToGrams(fourEggs, 100).nutrients.energy_kcal).toBe(150)
  })

  it('refuses negative grams and leaves a zero-gram item alone', () => {
    expect(() => rescaleToGrams(fourEggs, -1)).toThrow()
    const zero = { ...fourEggs, grams: 0 }
    expect(rescaleToGrams(zero, 50).quantity).toBe(4)
    expect(rescaleToGrams(zero, 50).grams).toBe(50)
  })
})

describe('sumPortions', () => {
  it('adds every key and counts entries', () => {
    const total = sumPortions([portionOf(oats, 50), portionOf(shake, 35)])
    expect(total.entryCount).toBe(2)
    expect(total.totals.energy_kcal).toBe(320)
    expect(total.totals.protein_g).toBe(31.5)
    expect(total.foodGroups.whole_grains).toBe(1.65)
    expect(total.foodGroups.dairy_or_alt).toBe(0.5)
  })

  it('is empty for no entries and rounds float noise away', () => {
    const empty = sumPortions([])
    expect(empty.entryCount).toBe(0)
    expect(empty.totals).toEqual(emptyNutrientVector())
    const noisy = sumPortions([
      { nutrients: { ...emptyNutrientVector(), fat_g: 0.1 }, foodGroups: emptyFoodGroupServes() },
      { nutrients: { ...emptyNutrientVector(), fat_g: 0.2 }, foodGroups: emptyFoodGroupServes() },
    ])
    expect(noisy.totals.fat_g).toBe(0.3)
  })
})

describe('sanitiseNutrientVector', () => {
  it('replaces negatives and NaN with 0', () => {
    const dirty = { ...emptyNutrientVector(), energy_kcal: -5, protein_g: Number.NaN, fat_g: 3 }
    const clean = sanitiseNutrientVector(dirty)
    expect(clean.energy_kcal).toBe(0)
    expect(clean.protein_g).toBe(0)
    expect(clean.fat_g).toBe(3)
  })
})
