import { z } from 'zod'
import { recalibrationAssessmentSchema } from './nutrition/recalibration.js'
import { WEIGHT_KG } from './profile.js'
import { targetVersionSchema } from './targets-api.js'

/** Wire shapes for `/api/v1/weight` and `/api/v1/recalibration` (slice 5). */

export const weightEntrySchema = z.object({
  id: z.uuid(),
  day: z.iso.date(),
  weightKg: z.number().positive(),
  note: z.string().nullable(),
  createdAt: z.iso.datetime(),
})
export type WeightEntry = z.infer<typeof weightEntrySchema>

export const WEIGHT_HISTORY_DAYS = { default: 90, min: 7, max: 730 } as const

export const weightsQuerySchema = z.object({
  /** How many days back to return, ending today. */
  days: z.coerce
    .number()
    .int()
    .min(WEIGHT_HISTORY_DAYS.min)
    .max(WEIGHT_HISTORY_DAYS.max)
    .default(WEIGHT_HISTORY_DAYS.default),
})
export type WeightsQuery = z.infer<typeof weightsQuerySchema>

export const weightsResponseSchema = z.object({
  today: z.iso.date(),
  /** Ascending by day, one per day. */
  entries: z.array(weightEntrySchema),
  goalWeightKg: z.number().nullable(),
  /** The pace the plan promises; 0 for maintenance and recomposition. */
  expectedKgPerWeek: z.number(),
})
export type WeightsResponse = z.infer<typeof weightsResponseSchema>

export const MAX_WEIGHT_NOTE_CHARS = 120

export const upsertWeightRequestSchema = z.object({
  day: z.iso.date({ error: 'Choose a day' }),
  weightKg: z
    .number({ error: 'Enter your weight' })
    .min(WEIGHT_KG.min, `Weight should be between ${WEIGHT_KG.min} and ${WEIGHT_KG.max} kg`)
    .max(WEIGHT_KG.max, `Weight should be between ${WEIGHT_KG.min} and ${WEIGHT_KG.max} kg`),
  note: z.string().trim().max(MAX_WEIGHT_NOTE_CHARS).nullable().default(null),
})
export type UpsertWeightRequest = z.infer<typeof upsertWeightRequestSchema>

export const weightResponseSchema = z.object({
  entry: weightEntrySchema,
  /** True when this weigh-in is the newest and the profile weight now shows it. */
  profileWeightUpdated: z.boolean(),
})
export type WeightResponse = z.infer<typeof weightResponseSchema>

export const recalibrationResponseSchema = z.object({
  assessment: recalibrationAssessmentSchema,
})
export type RecalibrationResponse = z.infer<typeof recalibrationResponseSchema>

/** The energy the person saw and accepted; the server re-assesses and refuses a stale one. */
export const applyRecalibrationRequestSchema = z.object({
  expectedEnergyKcal: z.number().positive(),
})
export type ApplyRecalibrationRequest = z.infer<typeof applyRecalibrationRequestSchema>

export const applyRecalibrationResponseSchema = z.object({
  version: targetVersionSchema,
})
export type ApplyRecalibrationResponse = z.infer<typeof applyRecalibrationResponseSchema>

export const snoozeRecalibrationResponseSchema = z.object({
  snoozedUntil: z.iso.date(),
})
export type SnoozeRecalibrationResponse = z.infer<typeof snoozeRecalibrationResponseSchema>
