import type { DietPattern, Sex } from '../profile.js'
import type { FoodGroupKey, NutrientKey } from './nutrients.js'

/**
 * Dietary reference intakes for adults, from the US NIH Office of Dietary Supplements
 * (RDA, or AI where no RDA exists). Source table: nutrition-engine/references/nutrients.md
 * section 2. Sex `unspecified` takes the higher of the two so nobody is under-targeted.
 */

export type AgeBand = '19-30' | '31-50' | '51-70' | '71+'

export function ageBand(age: number): AgeBand {
  if (age <= 30) return '19-30'
  if (age <= 50) return '31-50'
  if (age <= 70) return '51-70'
  return '71+'
}

export type MicroKey = Extract<
  NutrientKey,
  | 'potassium_mg'
  | 'calcium_mg'
  | 'iron_mg'
  | 'magnesium_mg'
  | 'zinc_mg'
  | 'vitamin_a_ug'
  | 'vitamin_c_mg'
  | 'vitamin_d_ug'
  | 'vitamin_b12_ug'
  | 'folate_ug'
>

export const MICRO_KEYS: readonly MicroKey[] = [
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
]

type BandTable = Readonly<Record<AgeBand, number>>
type SexTable = Readonly<Record<'male' | 'female', BandTable>>

const bands = (a: number, b: number, c: number, d: number): BandTable => ({
  '19-30': a,
  '31-50': b,
  '51-70': c,
  '71+': d,
})

export const DRI: Readonly<Record<MicroKey, SexTable>> = {
  potassium_mg: { male: bands(3400, 3400, 3400, 3400), female: bands(2600, 2600, 2600, 2600) },
  calcium_mg: { male: bands(1000, 1000, 1000, 1200), female: bands(1000, 1000, 1200, 1200) },
  iron_mg: { male: bands(8, 8, 8, 8), female: bands(18, 18, 8, 8) },
  magnesium_mg: { male: bands(400, 420, 420, 420), female: bands(310, 320, 320, 320) },
  zinc_mg: { male: bands(11, 11, 11, 11), female: bands(8, 8, 8, 8) },
  vitamin_a_ug: { male: bands(900, 900, 900, 900), female: bands(700, 700, 700, 700) },
  vitamin_c_mg: { male: bands(90, 90, 90, 90), female: bands(75, 75, 75, 75) },
  vitamin_d_ug: { male: bands(15, 15, 15, 20), female: bands(15, 15, 15, 20) },
  vitamin_b12_ug: { male: bands(2.4, 2.4, 2.4, 2.4), female: bands(2.4, 2.4, 2.4, 2.4) },
  folate_ug: { male: bands(400, 400, 400, 400), female: bands(400, 400, 400, 400) },
}

export function driFor(key: MicroKey, sex: Sex, age: number): number {
  const band = ageBand(age)
  const table = DRI[key]
  if (sex === 'unspecified') return Math.max(table.male[band], table.female[band])
  return table[sex][band]
}

export const SODIUM_LIMIT_MG = 2300

/**
 * Daily food-group serves (nutrients.md section 3, Australian Dietary Guidelines).
 * Returns null for the info-only groups so the caller can treat them differently.
 */
export function foodGroupServesFor(
  key: FoodGroupKey,
  sex: Sex,
  age: number,
  dietPattern: DietPattern,
): number | null {
  const male = sex !== 'female'
  switch (key) {
    case 'vegetables':
      return male ? 6 : 5
    case 'fruit':
      return 2
    case 'whole_grains':
      if (dietPattern === 'low_carb') return 3
      return male ? 6 : 4
    case 'protein_foods':
      return male ? 3 : 2.5
    case 'dairy_or_alt':
      if (sex === 'female' && age >= 71) return 4
      if (sex === 'female' && age >= 51) return 3.5
      return 2.5
    case 'legumes':
    case 'nuts_seeds':
      return null
  }
}
