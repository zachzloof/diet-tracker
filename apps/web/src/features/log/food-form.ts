import {
  FOOD_GROUP_KEYS,
  NUTRIENT_KEYS,
  emptyFoodGroupServes,
  emptyNutrientVector,
  foodInputSchema,
  toValidationDetails,
  type Food,
  type FoodBasis,
  type FoodGroupKey,
  type FoodInput,
  type NutrientKey,
} from '@diet-tracker/shared'

/**
 * The manual-entry form's state: every nutrient nullable while typing, so an empty field
 * is "0" on save rather than a validation nag. Label-style order: the numbers people see
 * on a packet first, the rest behind "More nutrients".
 */
export interface FoodFormState {
  name: string
  brand: string
  basis: FoodBasis
  servingGrams: number | null
  servingLabel: string
  nutrients: Record<NutrientKey, number | null>
  foodGroups: Record<FoodGroupKey, number | null>
}

export const LABEL_NUTRIENTS: readonly NutrientKey[] = [
  'energy_kcal',
  'protein_g',
  'carbs_g',
  'fat_g',
  'fiber_g',
  'sugar_g',
  'added_sugar_g',
  'saturated_fat_g',
  'sodium_mg',
]

export const MORE_NUTRIENTS: readonly NutrientKey[] = NUTRIENT_KEYS.filter(
  (key) => !LABEL_NUTRIENTS.includes(key),
)

export function emptyFoodForm(food?: Food | null): FoodFormState {
  const nutrients = {} as Record<NutrientKey, number | null>
  for (const key of NUTRIENT_KEYS) nutrients[key] = food ? food.nutrients[key] : null
  const foodGroups = {} as Record<FoodGroupKey, number | null>
  for (const key of FOOD_GROUP_KEYS) foodGroups[key] = food ? food.foodGroups[key] : null
  return {
    name: food?.name ?? '',
    brand: food?.brand ?? '',
    basis: food?.basis ?? 'per_100g',
    servingGrams: food?.servingGrams ?? null,
    servingLabel: food?.servingLabel ?? '',
    nutrients,
    foodGroups,
  }
}

export type FoodFormResult =
  { ok: true; data: FoodInput } | { ok: false; fieldErrors: Record<string, string[]> }

/** Empty numbers become 0; everything else goes through the shared schema. */
export function parseFoodForm(form: FoodFormState): FoodFormResult {
  const nutrients = emptyNutrientVector()
  for (const key of NUTRIENT_KEYS) nutrients[key] = form.nutrients[key] ?? 0
  const foodGroups = emptyFoodGroupServes()
  for (const key of FOOD_GROUP_KEYS) foodGroups[key] = form.foodGroups[key] ?? 0
  const result = foodInputSchema.safeParse({
    name: form.name,
    brand: form.brand.trim() === '' ? null : form.brand,
    basis: form.basis,
    servingGrams: form.basis === 'per_serving' ? form.servingGrams : null,
    servingLabel: form.servingLabel.trim() === '' ? null : form.servingLabel,
    nutrients,
    foodGroups,
  })
  if (result.success) return { ok: true, data: result.data }
  return { ok: false, fieldErrors: toValidationDetails(result.error).fieldErrors }
}

/** "per 100 g" or "1 scoop (35 g)": how the library shows what the numbers refer to. */
export function basisLabel(food: Pick<Food, 'basis' | 'servingGrams' | 'servingLabel'>): string {
  if (food.basis === 'per_100g') return 'per 100 g'
  const grams = food.servingGrams ?? 0
  return food.servingLabel ? `${food.servingLabel} (${grams} g)` : `1 serving (${grams} g)`
}
