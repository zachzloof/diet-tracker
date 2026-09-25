import { z } from 'zod'
import { storedPlanExplanationSchema } from './ai/schemas.js'
import {
  overridesSchema,
  targetInputSchema,
  targetKeySchema,
  targetsSchema,
} from './nutrition/targets.js'
import { goalSchema, profileSchema } from './profile.js'

/** Wire shapes for `/api/v1/profile` and `/api/v1/targets`. */

export const TARGET_TRIGGERS = ['onboarding', 'profile_change', 'recalibration'] as const
export const targetTriggerSchema = z.enum(TARGET_TRIGGERS)
export type TargetTrigger = z.infer<typeof targetTriggerSchema>

export const targetVersionSchema = z.object({
  id: z.uuid(),
  /** The user's local day the version took effect. Latest wins. */
  effectiveFrom: z.iso.date(),
  trigger: targetTriggerSchema,
  inputs: targetInputSchema,
  /** The engine's answer with no overrides applied. */
  computed: targetsSchema,
  overrides: overridesSchema,
  /** The engine's answer with overrides pinned. What the app scores against. */
  effective: targetsSchema,
  explanation: storedPlanExplanationSchema.nullable(),
  createdAt: z.iso.datetime(),
})
export type TargetVersion = z.infer<typeof targetVersionSchema>

export const targetsResponseSchema = z.object({ version: targetVersionSchema })
export type TargetsResponse = z.infer<typeof targetsResponseSchema>

export const targetHistoryItemSchema = z.object({
  id: z.uuid(),
  effectiveFrom: z.iso.date(),
  trigger: targetTriggerSchema,
  createdAt: z.iso.datetime(),
  weightKg: z.number(),
  goal: goalSchema,
  energyKcal: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
  overrideCount: z.number().int(),
})
export type TargetHistoryItem = z.infer<typeof targetHistoryItemSchema>

export const targetHistoryResponseSchema = z.object({
  versions: z.array(targetHistoryItemSchema),
})
export type TargetHistoryResponse = z.infer<typeof targetHistoryResponseSchema>

/** `null` removes an override. `confirm` accepts values below a safety floor. */
export const overridesInputSchema = z.object({
  overrides: z.partialRecord(targetKeySchema, z.number().min(0).max(100_000).nullable()),
  confirm: z.boolean().default(false),
})
export type OverridesInput = z.infer<typeof overridesInputSchema>

export const overrideWarningSchema = z.object({
  key: targetKeySchema,
  level: z.enum(['warning', 'blocked']),
  message: z.string(),
})
export type OverrideWarning = z.infer<typeof overrideWarningSchema>

export const overridesResponseSchema = z.object({
  version: targetVersionSchema,
  warnings: z.array(overrideWarningSchema),
})
export type OverridesResponse = z.infer<typeof overridesResponseSchema>

/** `details` on an `override_blocked` error. */
export const overrideBlockedDetailsSchema = z.object({
  blocked: z.array(overrideWarningSchema),
})

export const profileResponseSchema = z.object({ profile: profileSchema.nullable() })
export type ProfileResponse = z.infer<typeof profileResponseSchema>

export const profileSaveResponseSchema = z.object({
  profile: profileSchema,
  version: targetVersionSchema,
  /** True when saving created a new target version. */
  targetsChanged: z.boolean(),
})
export type ProfileSaveResponse = z.infer<typeof profileSaveResponseSchema>

export const explainResponseSchema = z.object({ explanation: storedPlanExplanationSchema })
export type ExplainResponse = z.infer<typeof explainResponseSchema>
