import { z } from 'zod'
import type { Gap } from './nutrition/gaps.js'
import type { TargetKey } from './nutrition/targets.js'

/**
 * Display preferences (D37): what the app shows, never what it computes. Every feature is
 * on by default; a person turns one off from Settings > Preferences when it is getting in
 * the way. Stored on the profile so a phone and a laptop agree.
 *
 * - `water`: the water card on Today, the hydration target, the water row on Week.
 * - `workouts`: the Training card on Today and Workouts under You. Logged sessions are kept.
 * - `nutrientDetail`: `full` is everything; `macros` is energy, protein, carbs, fat and
 *   fibre only (no vitamins, minerals, limits or food groups on screen).
 *
 * Nothing here changes a target, a day verdict or a stored estimate: the engine still
 * scores every nutrient, and turning a feature back on shows what was there all along.
 */

export const NUTRIENT_DETAILS = ['full', 'macros'] as const
export const nutrientDetailSchema = z.enum(NUTRIENT_DETAILS)
export type NutrientDetail = z.infer<typeof nutrientDetailSchema>

export const preferencesSchema = z.object({
  water: z.boolean().default(true),
  workouts: z.boolean().default(true),
  nutrientDetail: nutrientDetailSchema.default('full'),
})
export type Preferences = z.output<typeof preferencesSchema>

export const DEFAULT_PREFERENCES: Preferences = preferencesSchema.parse({})

/** `PATCH /api/v1/profile/preferences`: any subset; unknown keys are rejected. */
export const preferencesPatchSchema = z
  .strictObject({
    water: z.boolean().optional(),
    workouts: z.boolean().optional(),
    nutrientDetail: nutrientDetailSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to change')
export type PreferencesPatch = z.infer<typeof preferencesPatchSchema>

export const preferencesResponseSchema = z.object({ preferences: preferencesSchema })
export type PreferencesResponse = z.infer<typeof preferencesResponseSchema>

/** Everything a person sees in `macros` mode (plus water when that is on). */
export const MACRO_TARGET_KEYS: readonly TargetKey[] = [
  'energy_kcal',
  'protein_g',
  'carbs_g',
  'fat_g',
  'fiber_g',
]

/** Whether a target is shown under these preferences. The engine scores it either way. */
export function isTargetShown(key: TargetKey, prefs: Preferences): boolean {
  if (key === 'water_ml') return prefs.water
  if (prefs.nutrientDetail === 'macros') return MACRO_TARGET_KEYS.includes(key)
  return true
}

export function shownTargetKeys(keys: readonly TargetKey[], prefs: Preferences): TargetKey[] {
  return keys.filter((key) => isTargetShown(key, prefs))
}

/**
 * Drops the gaps about things the person has hidden, so Week and the weekly review never
 * nag about iron or water when neither is on screen. Rules without a key (logging) stay.
 */
export function filterGaps(gaps: readonly Gap[], prefs: Preferences): Gap[] {
  return gaps.filter((gap) => gap.key === null || isTargetShown(gap.key, prefs))
}
