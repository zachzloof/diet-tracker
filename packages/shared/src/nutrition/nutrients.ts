import { z } from 'zod'

/**
 * Canonical nutrient keys and units. Every nutrient vector in the database, every AI
 * schema and every target uses exactly these keys. Source of truth for the table in
 * `.claude/skills/nutrition-engine/references/nutrients.md`; keep the two in step.
 *
 * Units: energy kcal; macros g; minerals mg; vitamins mcg (`_ug`) or mg exactly as the
 * key suffix says; water ml; alcohol in standard drinks of 10 g ethanol.
 */

/** A non-negative amount. Vectors are complete: every key present, no nulls. */
const amount = z.number().min(0)

export const nutrientVectorSchema = z.strictObject({
  energy_kcal: amount,
  protein_g: amount,
  carbs_g: amount,
  fat_g: amount,
  fiber_g: amount,
  sugar_g: amount,
  added_sugar_g: amount,
  saturated_fat_g: amount,
  sodium_mg: amount,
  potassium_mg: amount,
  calcium_mg: amount,
  iron_mg: amount,
  magnesium_mg: amount,
  zinc_mg: amount,
  vitamin_a_ug: amount,
  vitamin_c_mg: amount,
  vitamin_d_ug: amount,
  vitamin_b12_ug: amount,
  folate_ug: amount,
  water_ml: amount,
  alcohol_std_drinks: amount,
})

export type NutrientVector = z.infer<typeof nutrientVectorSchema>

export const nutrientKeySchema = nutrientVectorSchema.keyof()
export type NutrientKey = z.infer<typeof nutrientKeySchema>
export const NUTRIENT_KEYS: readonly NutrientKey[] = nutrientKeySchema.options

export const NUTRIENT_UNITS = ['kcal', 'g', 'mg', 'ug', 'ml', 'std_drinks'] as const
export type NutrientUnit = (typeof NUTRIENT_UNITS)[number]

/**
 * How a target of this nutrient is scored.
 * goal: tolerance band around the target. minimum: met at or above. limit: met at or below.
 * info: displayed, never scored.
 */
export const TARGET_KINDS = ['goal', 'minimum', 'limit', 'info'] as const
export type TargetKind = (typeof TARGET_KINDS)[number]

export const NUTRIENT_GROUPS = [
  'energy',
  'macros',
  'minerals',
  'vitamins',
  'hydration',
  'other',
] as const
export type NutrientGroup = (typeof NUTRIENT_GROUPS)[number]

export interface NutrientMeta {
  readonly key: NutrientKey
  readonly label: string
  readonly unit: NutrientUnit
  /** Unit as shown to people, e.g. "mcg RAE" for vitamin A. */
  readonly unitLabel: string
  readonly kind: TargetKind
  readonly group: NutrientGroup
}

export const NUTRIENTS: Readonly<Record<NutrientKey, NutrientMeta>> = {
  energy_kcal: {
    key: 'energy_kcal',
    label: 'Energy',
    unit: 'kcal',
    unitLabel: 'kcal',
    kind: 'goal',
    group: 'energy',
  },
  protein_g: {
    key: 'protein_g',
    label: 'Protein',
    unit: 'g',
    unitLabel: 'g',
    kind: 'goal',
    group: 'macros',
  },
  carbs_g: {
    key: 'carbs_g',
    label: 'Carbs',
    unit: 'g',
    unitLabel: 'g',
    kind: 'goal',
    group: 'macros',
  },
  fat_g: { key: 'fat_g', label: 'Fat', unit: 'g', unitLabel: 'g', kind: 'goal', group: 'macros' },
  fiber_g: {
    key: 'fiber_g',
    label: 'Fibre',
    unit: 'g',
    unitLabel: 'g',
    kind: 'minimum',
    group: 'macros',
  },
  sugar_g: {
    key: 'sugar_g',
    label: 'Sugar',
    unit: 'g',
    unitLabel: 'g',
    kind: 'info',
    group: 'macros',
  },
  added_sugar_g: {
    key: 'added_sugar_g',
    label: 'Added sugar',
    unit: 'g',
    unitLabel: 'g',
    kind: 'limit',
    group: 'macros',
  },
  saturated_fat_g: {
    key: 'saturated_fat_g',
    label: 'Saturated fat',
    unit: 'g',
    unitLabel: 'g',
    kind: 'limit',
    group: 'macros',
  },
  sodium_mg: {
    key: 'sodium_mg',
    label: 'Sodium',
    unit: 'mg',
    unitLabel: 'mg',
    kind: 'limit',
    group: 'minerals',
  },
  potassium_mg: {
    key: 'potassium_mg',
    label: 'Potassium',
    unit: 'mg',
    unitLabel: 'mg',
    kind: 'minimum',
    group: 'minerals',
  },
  calcium_mg: {
    key: 'calcium_mg',
    label: 'Calcium',
    unit: 'mg',
    unitLabel: 'mg',
    kind: 'minimum',
    group: 'minerals',
  },
  iron_mg: {
    key: 'iron_mg',
    label: 'Iron',
    unit: 'mg',
    unitLabel: 'mg',
    kind: 'minimum',
    group: 'minerals',
  },
  magnesium_mg: {
    key: 'magnesium_mg',
    label: 'Magnesium',
    unit: 'mg',
    unitLabel: 'mg',
    kind: 'minimum',
    group: 'minerals',
  },
  zinc_mg: {
    key: 'zinc_mg',
    label: 'Zinc',
    unit: 'mg',
    unitLabel: 'mg',
    kind: 'minimum',
    group: 'minerals',
  },
  vitamin_a_ug: {
    key: 'vitamin_a_ug',
    label: 'Vitamin A',
    unit: 'ug',
    unitLabel: 'mcg RAE',
    kind: 'minimum',
    group: 'vitamins',
  },
  vitamin_c_mg: {
    key: 'vitamin_c_mg',
    label: 'Vitamin C',
    unit: 'mg',
    unitLabel: 'mg',
    kind: 'minimum',
    group: 'vitamins',
  },
  vitamin_d_ug: {
    key: 'vitamin_d_ug',
    label: 'Vitamin D',
    unit: 'ug',
    unitLabel: 'mcg',
    kind: 'minimum',
    group: 'vitamins',
  },
  vitamin_b12_ug: {
    key: 'vitamin_b12_ug',
    label: 'Vitamin B12',
    unit: 'ug',
    unitLabel: 'mcg',
    kind: 'minimum',
    group: 'vitamins',
  },
  folate_ug: {
    key: 'folate_ug',
    label: 'Folate',
    unit: 'ug',
    unitLabel: 'mcg DFE',
    kind: 'minimum',
    group: 'vitamins',
  },
  water_ml: {
    key: 'water_ml',
    label: 'Water',
    unit: 'ml',
    unitLabel: 'ml',
    kind: 'goal',
    group: 'hydration',
  },
  alcohol_std_drinks: {
    key: 'alcohol_std_drinks',
    label: 'Alcohol',
    unit: 'std_drinks',
    unitLabel: 'drinks',
    kind: 'limit',
    group: 'other',
  },
}

/** Food-group serves. Serve sizes follow the Australian Dietary Guidelines. */
export const foodGroupServesSchema = z.strictObject({
  vegetables: amount,
  fruit: amount,
  whole_grains: amount,
  protein_foods: amount,
  dairy_or_alt: amount,
  legumes: amount,
  nuts_seeds: amount,
})

export type FoodGroupServes = z.infer<typeof foodGroupServesSchema>

export const foodGroupKeySchema = foodGroupServesSchema.keyof()
export type FoodGroupKey = z.infer<typeof foodGroupKeySchema>
export const FOOD_GROUP_KEYS: readonly FoodGroupKey[] = foodGroupKeySchema.options

export interface FoodGroupMeta {
  readonly key: FoodGroupKey
  readonly label: string
  /** Quoted verbatim in AI prompts so estimates stay consistent. */
  readonly serveDefinition: string
  readonly kind: TargetKind
}

export const FOOD_GROUPS: Readonly<Record<FoodGroupKey, FoodGroupMeta>> = {
  vegetables: {
    key: 'vegetables',
    label: 'Vegetables',
    serveDefinition: '75 g cooked vegetables or legumes, or 1 cup salad, or half a medium potato',
    kind: 'minimum',
  },
  fruit: {
    key: 'fruit',
    label: 'Fruit',
    serveDefinition: '150 g fresh fruit, or 1 medium piece, or 30 g dried',
    kind: 'minimum',
  },
  whole_grains: {
    key: 'whole_grains',
    label: 'Whole grains',
    serveDefinition:
      '1 slice wholegrain bread, half a cup cooked wholegrain rice, pasta or oats, 30 g wholegrain cereal',
    kind: 'minimum',
  },
  protein_foods: {
    key: 'protein_foods',
    label: 'Protein foods',
    serveDefinition:
      '65 g cooked lean meat, 80 g cooked poultry, 100 g cooked fish, 2 large eggs, 150 g cooked legumes or tofu, 30 g nuts or seeds',
    kind: 'minimum',
  },
  dairy_or_alt: {
    key: 'dairy_or_alt',
    label: 'Dairy or alternatives',
    serveDefinition: '250 ml milk or fortified plant milk, 200 g yoghurt, 40 g hard cheese',
    kind: 'minimum',
  },
  legumes: {
    key: 'legumes',
    label: 'Legumes',
    serveDefinition: '150 g cooked legumes (counts toward protein foods and vegetables too)',
    kind: 'info',
  },
  nuts_seeds: {
    key: 'nuts_seeds',
    label: 'Nuts and seeds',
    serveDefinition: '30 g',
    kind: 'info',
  },
}

export function emptyNutrientVector(): NutrientVector {
  return {
    energy_kcal: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
    sugar_g: 0,
    added_sugar_g: 0,
    saturated_fat_g: 0,
    sodium_mg: 0,
    potassium_mg: 0,
    calcium_mg: 0,
    iron_mg: 0,
    magnesium_mg: 0,
    zinc_mg: 0,
    vitamin_a_ug: 0,
    vitamin_c_mg: 0,
    vitamin_d_ug: 0,
    vitamin_b12_ug: 0,
    folate_ug: 0,
    water_ml: 0,
    alcohol_std_drinks: 0,
  }
}

export function emptyFoodGroupServes(): FoodGroupServes {
  return {
    vegetables: 0,
    fruit: 0,
    whole_grains: 0,
    protein_foods: 0,
    dairy_or_alt: 0,
    legumes: 0,
    nuts_seeds: 0,
  }
}

export function addNutrientVectors(a: NutrientVector, b: NutrientVector): NutrientVector {
  const out = emptyNutrientVector()
  for (const key of NUTRIENT_KEYS) out[key] = a[key] + b[key]
  return out
}

export function scaleNutrientVector(v: NutrientVector, factor: number): NutrientVector {
  const out = emptyNutrientVector()
  for (const key of NUTRIENT_KEYS) out[key] = v[key] * factor
  return out
}

export function addFoodGroupServes(a: FoodGroupServes, b: FoodGroupServes): FoodGroupServes {
  const out = emptyFoodGroupServes()
  for (const key of FOOD_GROUP_KEYS) out[key] = a[key] + b[key]
  return out
}

export function scaleFoodGroupServes(v: FoodGroupServes, factor: number): FoodGroupServes {
  const out = emptyFoodGroupServes()
  for (const key of FOOD_GROUP_KEYS) out[key] = v[key] * factor
  return out
}
