import { describe, expect, it } from 'vitest'
import {
  FOOD_GROUPS,
  FOOD_GROUP_KEYS,
  NUTRIENTS,
  NUTRIENT_KEYS,
  addNutrientVectors,
  emptyFoodGroupServes,
  emptyNutrientVector,
  foodGroupServesSchema,
  nutrientVectorSchema,
  scaleNutrientVector,
} from './nutrients.js'

describe('nutrient enum', () => {
  it('has the 21 canonical keys from nutrients.md, in order', () => {
    expect(NUTRIENT_KEYS).toEqual([
      'energy_kcal',
      'protein_g',
      'carbs_g',
      'fat_g',
      'fiber_g',
      'sugar_g',
      'added_sugar_g',
      'saturated_fat_g',
      'sodium_mg',
      'potassium_mg',
      'calcium_mg',
      'iron_mg',
      'magnesium_mg',
      'zinc_mg',
      'vitamin_a_ug',
      'vitamin_c_mg',
      'vitamin_d_ug',
      'vitamin_b12_ug',
      'folate_ug',
      'water_ml',
      'alcohol_std_drinks',
    ])
  })

  it('has metadata whose key and unit agree with the key suffix', () => {
    for (const key of NUTRIENT_KEYS) {
      const meta = NUTRIENTS[key]
      expect(meta.key).toBe(key)
      if (key.endsWith('_g')) expect(meta.unit).toBe('g')
      if (key.endsWith('_mg')) expect(meta.unit).toBe('mg')
      if (key.endsWith('_ug')) expect(meta.unit).toBe('ug')
      if (key.endsWith('_ml')) expect(meta.unit).toBe('ml')
      if (key.endsWith('_kcal')) expect(meta.unit).toBe('kcal')
    }
    expect(NUTRIENTS.alcohol_std_drinks.unit).toBe('std_drinks')
  })

  it('has the 7 food groups', () => {
    expect(FOOD_GROUP_KEYS).toEqual([
      'vegetables',
      'fruit',
      'whole_grains',
      'protein_foods',
      'dairy_or_alt',
      'legumes',
      'nuts_seeds',
    ])
    for (const key of FOOD_GROUP_KEYS) expect(FOOD_GROUPS[key].key).toBe(key)
  })
})

describe('nutrient vector schema', () => {
  it('accepts a complete vector of zeros', () => {
    expect(nutrientVectorSchema.safeParse(emptyNutrientVector()).success).toBe(true)
    expect(foodGroupServesSchema.safeParse(emptyFoodGroupServes()).success).toBe(true)
  })

  it('rejects a missing key, a negative value, a null and an extra key', () => {
    const { energy_kcal: _dropped, ...missing } = emptyNutrientVector()
    expect(nutrientVectorSchema.safeParse(missing).success).toBe(false)
    expect(nutrientVectorSchema.safeParse({ ...emptyNutrientVector(), fat_g: -1 }).success).toBe(
      false,
    )
    expect(nutrientVectorSchema.safeParse({ ...emptyNutrientVector(), fat_g: null }).success).toBe(
      false,
    )
    expect(
      nutrientVectorSchema.safeParse({ ...emptyNutrientVector(), cholesterol_mg: 1 }).success,
    ).toBe(false)
  })
})

describe('vector arithmetic', () => {
  it('adds and scales key by key', () => {
    const eggs = { ...emptyNutrientVector(), energy_kcal: 300, protein_g: 26 }
    const toast = { ...emptyNutrientVector(), energy_kcal: 160, carbs_g: 28 }
    const sum = addNutrientVectors(eggs, toast)
    expect(sum.energy_kcal).toBe(460)
    expect(sum.protein_g).toBe(26)
    expect(sum.carbs_g).toBe(28)
    expect(scaleNutrientVector(eggs, 0.5).protein_g).toBe(13)
  })
})
