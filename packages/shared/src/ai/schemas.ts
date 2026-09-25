import { z } from 'zod'

/**
 * Structured Outputs schemas. Strict mode needs every field required and no extra
 * properties, so optional values are `| null` and lists have no min/max on the wire; the
 * prompt states the expected counts and the caller trims. Keep in step with
 * `.claude/skills/ai-food-estimation/references/schemas.md`.
 */

/** Purpose `explain_plan` (slice 2): a plain-English reading of the computed targets. */
export const planExplanationSchema = z.object({
  headline: z.string(),
  paragraphs: z.array(z.string()),
  key_habits: z.array(z.string()),
  caveats: z.array(z.string()),
})
export type PlanExplanation = z.infer<typeof planExplanationSchema>

/** What is cached on a target version once the explanation has been generated. */
export const storedPlanExplanationSchema = z.object({
  ...planExplanationSchema.shape,
  model: z.string(),
  generatedAt: z.iso.datetime(),
})
export type StoredPlanExplanation = z.infer<typeof storedPlanExplanationSchema>

export const AI_PURPOSES = ['explain_plan', 'estimate', 'weekly_review'] as const
export const aiPurposeSchema = z.enum(AI_PURPOSES)
export type AiPurpose = z.infer<typeof aiPurposeSchema>
