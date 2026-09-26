import { emptyFoodGroupServes, emptyNutrientVector } from '@diet-tracker/shared'
import { describe, expect, it } from 'vitest'
import { applyItemEdit, samePortion, snapshotItem, type EditableItem } from './item-edit'

const fourEggs: EditableItem = {
  quantity: 4,
  grams: 200,
  nutrients: { ...emptyNutrientVector(), energy_kcal: 300, protein_g: 26, fat_g: 20 },
  foodGroups: { ...emptyFoodGroupServes(), protein_foods: 2 },
}

describe('applyItemEdit', () => {
  it('rescales everything when the quantity changes', () => {
    const { item, base } = applyItemEdit(fourEggs, fourEggs, { kind: 'quantity', value: 3 })
    expect(item.quantity).toBe(3)
    expect(item.grams).toBe(150)
    expect(item.nutrients.energy_kcal).toBe(225)
    expect(item.foodGroups.protein_foods).toBe(1.5)
    expect(base).toBe(fourEggs)
  })

  it('rescales everything, quantity included, when the weight changes', () => {
    const { item } = applyItemEdit(fourEggs, fourEggs, { kind: 'grams', value: 100 })
    expect(item.grams).toBe(100)
    expect(item.quantity).toBe(2)
    expect(item.nutrients.protein_g).toBe(13)
  })

  it('changes only that number when a nutrient is edited, and makes it the new base', () => {
    const { item, base } = applyItemEdit(fourEggs, fourEggs, {
      kind: 'nutrient',
      key: 'protein_g',
      value: 30,
    })
    expect(item.nutrients.protein_g).toBe(30)
    expect(item.nutrients.energy_kcal).toBe(300)
    expect(item.grams).toBe(200)
    expect(base).toBe(item)
    expect(fourEggs.nutrients.protein_g).toBe(26)
  })

  it('scales a corrected nutrient with later portion changes', () => {
    const corrected = applyItemEdit(fourEggs, fourEggs, {
      kind: 'nutrient',
      key: 'protein_g',
      value: 30,
    })
    const doubled = applyItemEdit(corrected.base, corrected.item, { kind: 'grams', value: 400 })
    expect(doubled.item.nutrients.protein_g).toBe(60)
    expect(doubled.item.nutrients.energy_kcal).toBe(600)
    expect(doubled.item.quantity).toBe(8)
  })

  it('recovers after the person types 0 on the way to a new number', () => {
    const zero = applyItemEdit(fourEggs, fourEggs, { kind: 'grams', value: 0 })
    expect(zero.item.nutrients.energy_kcal).toBe(0)
    const back = applyItemEdit(zero.base, zero.item, { kind: 'grams', value: 50 })
    expect(back.item.nutrients.energy_kcal).toBe(75)
    expect(back.item.quantity).toBe(1)
  })
})

describe('samePortion and snapshotItem', () => {
  it('compares every number and copies without sharing vectors', () => {
    const copy = snapshotItem(fourEggs)
    expect(samePortion(copy, fourEggs)).toBe(true)
    copy.nutrients.protein_g = 1
    expect(samePortion(copy, fourEggs)).toBe(false)
    expect(fourEggs.nutrients.protein_g).toBe(26)
  })
})
