import { z } from 'zod'
import { isValidTimeZone } from './dates.js'

/**
 * Who the person is, as the nutrition engine and the UI both see it. Enum values are
 * stored as text in Postgres and validated here, so adding one is a code change only.
 */

export const SEXES = ['male', 'female', 'unspecified'] as const
export const sexSchema = z.enum(SEXES)
export type Sex = z.infer<typeof sexSchema>

export const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'high', 'very_high'] as const
export const activitySchema = z.enum(ACTIVITY_LEVELS)
export type Activity = z.infer<typeof activitySchema>

export const TRAINING_TYPES = [
  'none',
  'general',
  'strength',
  'cardio',
  'combat',
  'crossfit',
  'team_sport',
  'mixed',
] as const
export const trainingTypeSchema = z.enum(TRAINING_TYPES)
export type TrainingType = z.infer<typeof trainingTypeSchema>

export const GOALS = ['lose', 'maintain', 'gain', 'recomp'] as const
export const goalSchema = z.enum(GOALS)
export type Goal = z.infer<typeof goalSchema>

/** lose: gentle, standard, aggressive. gain: lean, fast. maintain and recomp have no pace. */
export const PACES = ['gentle', 'standard', 'aggressive', 'lean', 'fast'] as const
export const paceSchema = z.enum(PACES)
export type Pace = z.infer<typeof paceSchema>

export const PACES_BY_GOAL: Readonly<Record<Goal, readonly Pace[]>> = {
  lose: ['gentle', 'standard', 'aggressive'],
  maintain: [],
  gain: ['lean', 'fast'],
  recomp: [],
}

export const DEFAULT_PACE: Readonly<Record<Goal, Pace | null>> = {
  lose: 'standard',
  maintain: null,
  gain: 'lean',
  recomp: null,
}

export const DIET_PATTERNS = [
  'omnivore',
  'pescatarian',
  'vegetarian',
  'vegan',
  'mediterranean',
  'low_carb',
] as const
export const dietPatternSchema = z.enum(DIET_PATTERNS)
export type DietPattern = z.infer<typeof dietPatternSchema>

export const UNIT_SYSTEMS = ['metric', 'imperial'] as const
export const unitSystemSchema = z.enum(UNIT_SYSTEMS)
export type UnitSystem = z.infer<typeof unitSystemSchema>

/** Common allergens offered as chips; the list is free text so anything else fits too. */
export const COMMON_ALLERGENS = [
  'dairy',
  'eggs',
  'gluten',
  'peanuts',
  'tree nuts',
  'soy',
  'fish',
  'shellfish',
  'sesame',
] as const

/** Safety flags (decision D10). Any true flag forces maintenance targets. */
export const safetyFlagsSchema = z.strictObject({
  pregnant: z.boolean(),
  breastfeeding: z.boolean(),
  edHistory: z.boolean(),
})
export type SafetyFlags = z.infer<typeof safetyFlagsSchema>

export const NO_FLAGS: SafetyFlags = { pregnant: false, breastfeeding: false, edHistory: false }

export const MIN_AGE = 18

export const HEIGHT_CM = { min: 100, max: 250 } as const
export const WEIGHT_KG = { min: 30, max: 300 } as const
export const BODY_FAT_PCT = { min: 3, max: 60 } as const

const shortText = z.string().trim().min(1).max(40)
const textList = z.array(shortText).max(30)

/** The onboarding and profile-edit payload. Metric only on the wire; the UI converts. */
export const profileInputSchema = z
  .object({
    sex: sexSchema,
    dob: z.iso.date({ error: 'Enter your date of birth' }),
    heightCm: z
      .number({ error: 'Enter your height' })
      .min(HEIGHT_CM.min, `Height should be between ${HEIGHT_CM.min} and ${HEIGHT_CM.max} cm`)
      .max(HEIGHT_CM.max, `Height should be between ${HEIGHT_CM.min} and ${HEIGHT_CM.max} cm`),
    weightKg: z
      .number({ error: 'Enter your weight' })
      .min(WEIGHT_KG.min, `Weight should be between ${WEIGHT_KG.min} and ${WEIGHT_KG.max} kg`)
      .max(WEIGHT_KG.max, `Weight should be between ${WEIGHT_KG.min} and ${WEIGHT_KG.max} kg`),
    bodyFatPct: z
      .number()
      .min(
        BODY_FAT_PCT.min,
        `Body fat should be between ${BODY_FAT_PCT.min} and ${BODY_FAT_PCT.max}%`,
      )
      .max(
        BODY_FAT_PCT.max,
        `Body fat should be between ${BODY_FAT_PCT.min} and ${BODY_FAT_PCT.max}%`,
      )
      .nullable(),
    goal: goalSchema,
    pace: paceSchema.nullable(),
    goalWeightKg: z
      .number()
      .min(WEIGHT_KG.min, `Goal weight should be between ${WEIGHT_KG.min} and ${WEIGHT_KG.max} kg`)
      .max(WEIGHT_KG.max, `Goal weight should be between ${WEIGHT_KG.min} and ${WEIGHT_KG.max} kg`)
      .nullable(),
    activity: activitySchema,
    trainingType: trainingTypeSchema,
    trainingDaysPerWeek: z.number().int().min(0).max(7),
    dietPattern: dietPatternSchema,
    allergies: textList,
    dislikes: textList,
    timezone: z.string().refine(isValidTimeZone, 'Choose a valid time zone'),
    units: unitSystemSchema,
    flags: safetyFlagsSchema,
  })
  .superRefine((value, ctx) => {
    const allowed = PACES_BY_GOAL[value.goal]
    if (allowed.length === 0 && value.pace !== null) {
      ctx.addIssue({ code: 'custom', path: ['pace'], message: 'This goal has no pace' })
    }
    if (allowed.length > 0 && (value.pace === null || !allowed.includes(value.pace))) {
      ctx.addIssue({ code: 'custom', path: ['pace'], message: 'Choose a pace for this goal' })
    }
    if (
      value.goal === 'lose' &&
      value.goalWeightKg !== null &&
      value.goalWeightKg >= value.weightKg
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['goalWeightKg'],
        message: 'Goal weight should be below your current weight',
      })
    }
    if (
      value.goal === 'gain' &&
      value.goalWeightKg !== null &&
      value.goalWeightKg <= value.weightKg
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['goalWeightKg'],
        message: 'Goal weight should be above your current weight',
      })
    }
  })
export type ProfileInput = z.infer<typeof profileInputSchema>

/** A saved profile as the API returns it. */
export const profileSchema = z.object({
  ...profileInputSchema.shape,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type Profile = z.infer<typeof profileSchema>

/** Unit conversions (targets.md section 9). Store metric; convert once at the edge. */
export const KG_PER_LB = 0.45359237
export const CM_PER_IN = 2.54

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB
}
export function kgToLb(kg: number): number {
  return kg / KG_PER_LB
}
export function feetInchesToCm(feet: number, inches: number): number {
  return (feet * 12 + inches) * CM_PER_IN
}
export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cm / CM_PER_IN)
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 }
}
