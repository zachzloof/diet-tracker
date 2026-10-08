import type { DietPattern, Sex } from '../profile.js'
import type { FoodGroupKey, NutrientKey } from './nutrients.js'

/**
 * Dietary reference intakes for adults, from the US NIH Office of Dietary Supplements
 * (RDA, or AI where no RDA exists; vitamin E as mg alpha-tocopherol, vitamin K and omega-3
 * (ALA) as AIs, iodine 150 mcg). Source table: nutrition-engine/references/nutrients.md
 * section 2. Sex `unspecified` takes the higher of the two so nobody is under-targeted.
 */

export type AgeBand = '19-30' | '31-50' | '51-70' | '71+'

export function ageBand(age: number): AgeBand {
  if (age <= 30) return '19-30'
  if (age <= 50) return '31-50'
  if (age <= 70) return '51-70'
  return '71+'
}

/**
 * Keys with a DRI the engine turns into a `minimum` target: the minerals and vitamins plus
 * omega-3 (an Adequate Intake for ALA, the only omega-3 with a reference value).
 */
export type MicroKey = Extract<
  NutrientKey,
  | 'potassium_mg'
  | 'calcium_mg'
  | 'iron_mg'
  | 'magnesium_mg'
  | 'zinc_mg'
  | 'iodine_ug'
  | 'vitamin_a_ug'
  | 'vitamin_c_mg'
  | 'vitamin_d_ug'
  | 'vitamin_b12_ug'
  | 'folate_ug'
  | 'vitamin_e_mg'
  | 'vitamin_k_ug'
  | 'omega3_g'
>

export const MICRO_KEYS: readonly MicroKey[] = [
  'potassium_mg',
  'calcium_mg',
  'iron_mg',
  'magnesium_mg',
  'zinc_mg',
  'iodine_ug',
  'vitamin_a_ug',
  'vitamin_c_mg',
  'vitamin_d_ug',
  'vitamin_b12_ug',
  'folate_ug',
  'vitamin_e_mg',
  'vitamin_k_ug',
  'omega3_g',
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
  iodine_ug: { male: bands(150, 150, 150, 150), female: bands(150, 150, 150, 150) },
  vitamin_a_ug: { male: bands(900, 900, 900, 900), female: bands(700, 700, 700, 700) },
  vitamin_c_mg: { male: bands(90, 90, 90, 90), female: bands(75, 75, 75, 75) },
  vitamin_d_ug: { male: bands(15, 15, 15, 20), female: bands(15, 15, 15, 20) },
  vitamin_b12_ug: { male: bands(2.4, 2.4, 2.4, 2.4), female: bands(2.4, 2.4, 2.4, 2.4) },
  folate_ug: { male: bands(400, 400, 400, 400), female: bands(400, 400, 400, 400) },
  vitamin_e_mg: { male: bands(15, 15, 15, 15), female: bands(15, 15, 15, 15) },
  vitamin_k_ug: { male: bands(120, 120, 120, 120), female: bands(90, 90, 90, 90) },
  omega3_g: { male: bands(1.6, 1.6, 1.6, 1.6), female: bands(1.1, 1.1, 1.1, 1.1) },
}

/** Nutrients whose reference value is an Adequate Intake rather than an RDA. */
export const ADEQUATE_INTAKE_KEYS: readonly MicroKey[] = [
  'potassium_mg',
  'vitamin_k_ug',
  'omega3_g',
]

export function driFor(key: MicroKey, sex: Sex, age: number): number {
  const band = ageBand(age)
  const table = DRI[key]
  if (sex === 'unspecified') return Math.max(table.male[band], table.female[band])
  return table[sex][band]
}

export const SODIUM_LIMIT_MG = 2300

/**
 * Tolerable upper intake levels for adults (NIH Office of Dietary Supplements, from the IOM
 * DRI reports), nutrients.md section 2. A `minimum` target scores `over` at or above its UL
 * (D34). Only nutrients whose UL applies to total intake from food are listed: magnesium's
 * UL (350 mg) and folate's (1000 mcg) are for supplemental forms only; potassium, vitamin
 * B12, vitamin K and omega-3 have no UL. Vitamin A's UL is for preformed vitamin A
 * (retinol); the estimate is in RAE, so a carotenoid-heavy day can trip it. Calcium's UL
 * drops from 2500 to 2000 mg after 50.
 */
export const UPPER_LIMIT: Readonly<Partial<Record<MicroKey, BandTable>>> = {
  calcium_mg: bands(2500, 2500, 2000, 2000),
  iron_mg: bands(45, 45, 45, 45),
  zinc_mg: bands(40, 40, 40, 40),
  iodine_ug: bands(1100, 1100, 1100, 1100),
  vitamin_a_ug: bands(3000, 3000, 3000, 3000),
  vitamin_c_mg: bands(2000, 2000, 2000, 2000),
  vitamin_d_ug: bands(100, 100, 100, 100),
  vitamin_e_mg: bands(1000, 1000, 1000, 1000),
}

/** The UL for an adult of this age, or null when none applies to intake from food. */
export function upperLimitFor(key: MicroKey, age: number): number | null {
  return UPPER_LIMIT[key]?.[ageBand(age)] ?? null
}

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
