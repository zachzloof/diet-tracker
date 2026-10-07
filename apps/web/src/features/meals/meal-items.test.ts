import {
  emptyFoodGroupServes,
  emptyNutrientVector,
  savedMealEntries,
  type SavedMeal,
  type SavedMealItem,
} from '@diet-tracker/shared'
import { describe, expect, it } from 'vitest'
import { applyItemEdit } from '@/features/log/item-edit'
import {
  filterMeals,
  fromDraftItem,
  ingredientCount,
  portionGrams,
  portionsFromGrams,
  scaleDraftItems,
  toDraftItem,
} from './meal-items'

const oats: SavedMealItem = {
  name: 'Rolled oats',
  quantity: 50,
  unit: 'g',
  grams: 50,
  nutrients: { ...emptyNutrientVector(), energy_kcal: 190, protein_g: 6.5 },
  foodGroups: { ...emptyFoodGroupServes(), whole_grains: 1.65 },
  foodId: '0199a3f0-0000-7000-8000-000000000001',
}
const eggs: SavedMealItem = {
  name: 'Eggs',
  quantity: 3,
  unit: 'egg',
  grams: 150,
  nutrients: { ...emptyNutrientVector(), energy_kcal: 225, protein_g: 19.5 },
  foodGroups: { ...emptyFoodGroupServes(), protein_foods: 1.5 },
  foodId: null,
}

describe('toDraftItem and fromDraftItem', () => {
  it('round-trip an ingredient unchanged and give each draft its own key', () => {
    const a = toDraftItem(oats)
    const b = toDraftItem(eggs)
    expect(a.key).not.toBe(b.key)
    expect(a.expanded).toBe(false)
    expect(fromDraftItem(a)).toEqual(oats)
    expect(fromDraftItem(b)).toEqual(eggs)
  })

  it('detach the draft from the saved meal', () => {
    const draft = toDraftItem(oats)
    draft.nutrients.energy_kcal = 1
    draft.base.nutrients.energy_kcal = 2
    expect(oats.nutrients.energy_kcal).toBe(190)
  })
})

describe('scaleDraftItems', () => {
  it('halves every ingredient and keeps names, units and links', () => {
    const half = scaleDraftItems([toDraftItem(oats), toDraftItem(eggs)], 0.5).map(fromDraftItem)
    expect(half[0]).toMatchObject({ name: 'Rolled oats', quantity: 25, grams: 25, unit: 'g' })
    expect(half[0]?.nutrients.energy_kcal).toBe(95)
    expect(half[0]?.foodId).toBe(oats.foodId)
    expect(half[1]).toMatchObject({ quantity: 1.5, grams: 75 })
    expect(half[1]?.foodGroups.protein_foods).toBe(0.75)
  })

  it('comes back to the saved numbers after going to two portions and back to one', () => {
    const drafts = [toDraftItem(oats), toDraftItem(eggs)]
    const back = scaleDraftItems(scaleDraftItems(drafts, 2), 0.5).map(fromDraftItem)
    expect(back).toEqual([oats, eggs])
  })

  it('scales the base too, so a later amount edit works from the new portion', () => {
    const [double] = scaleDraftItems([toDraftItem(eggs)], 2)
    // Six eggs on screen; the person changes it to four.
    const edited = applyItemEdit(double!.base, double!, { kind: 'quantity', value: 4 })
    expect(edited.item.grams).toBe(200)
    expect(edited.item.nutrients.energy_kcal).toBe(300)
  })

  it('keeps a corrected nutrient through a portion change', () => {
    const draft = toDraftItem(eggs)
    const corrected = applyItemEdit(draft.base, draft, {
      kind: 'nutrient',
      key: 'energy_kcal',
      value: 240,
    })
    const [double] = scaleDraftItems([{ ...draft, ...corrected.item, base: corrected.base }], 2)
    expect(double?.nutrients.energy_kcal).toBe(480)
    expect(double?.nutrients.protein_g).toBe(39)
  })

  it('produces entries the log accepts', () => {
    const items = scaleDraftItems([toDraftItem(oats), toDraftItem(eggs)], 1.5).map(fromDraftItem)
    const entries = savedMealEntries(items)
    expect(entries.map((e) => e.source)).toEqual(['library', 'manual'])
    expect(entries.reduce((sum, e) => sum + e.nutrients.energy_kcal, 0)).toBe(622.5)
  })
})

describe('filterMeals', () => {
  const meal = (id: number, name: string, items: SavedMealItem[]): SavedMeal => ({
    id: `0199a3f0-0000-7000-8000-00000000000${id}`,
    name,
    items,
    lastUsedAt: null,
    createdAt: '2026-10-01T07:00:00.000Z',
    updatedAt: '2026-10-01T07:00:00.000Z',
  })
  const porridge = meal(1, 'Banana porridge', [oats])
  const breakfast = meal(2, 'Big breakfast', [eggs, oats])
  const omelette = meal(3, 'Omelette', [eggs])
  const all = [porridge, breakfast, omelette]

  it('returns everything, in order, for an empty or blank search', () => {
    expect(filterMeals(all, '')).toEqual(all)
    expect(filterMeals(all, '   ')).toEqual(all)
  })

  it('matches the name, ignoring case', () => {
    expect(filterMeals(all, 'PORR')).toEqual([porridge])
  })

  it('matches an ingredient, keeping the list order', () => {
    expect(filterMeals(all, 'oats')).toEqual([porridge, breakfast])
    expect(filterMeals(all, 'egg')).toEqual([breakfast, omelette])
  })

  it('needs every word, across the name and the ingredients', () => {
    expect(filterMeals(all, 'big oats')).toEqual([breakfast])
    expect(filterMeals(all, 'banana eggs')).toEqual([])
  })
})

describe('ingredientCount', () => {
  it('pluralises', () => {
    expect(ingredientCount(1)).toBe('1 ingredient')
    expect(ingredientCount(3)).toBe('3 ingredients')
  })
})

describe('portionGrams and portionsFromGrams', () => {
  it('weigh one portion from its ingredients and ignore ingredients with no weight', () => {
    expect(portionGrams([oats, eggs])).toBe(200)
    expect(portionGrams([oats, { ...eggs, grams: 0 }])).toBe(50)
    expect(portionGrams([])).toBe(0)
  })

  it('turn grams of the cooked meal into portions', () => {
    expect(portionsFromGrams(100, 200)).toBe(0.5)
    expect(portionsFromGrams(300, 200)).toBe(1.5)
    expect(portionsFromGrams(100, 300)).toBe(0.333)
  })

  it('give nothing for an empty, zero or weightless meal', () => {
    expect(portionsFromGrams(null, 200)).toBeNull()
    expect(portionsFromGrams(0, 200)).toBeNull()
    expect(portionsFromGrams(100, 0)).toBeNull()
  })
})
