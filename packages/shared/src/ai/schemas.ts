import { z } from 'zod'
import { confidenceSchema, mealSchema } from '../log/enums.js'
import { foodGroupServesSchema, nutrientVectorSchema } from '../nutrition/nutrients.js'

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

/**
 * Purpose `estimate` (slice 3): one item per distinct food in the person's text. Amounts
 * are for the TOTAL quantity described, never per 100 g. Vectors are complete: the
 * nutrient and food-group schemas list every key and refuse negatives.
 */
export const foodItemSchema = z.object({
  /** Canonical, e.g. "Egg, whole, large, boiled". */
  name: z.string(),
  /** The fragment of the user's text this item came from. */
  input_text: z.string(),
  quantity: z.number(),
  /** "egg", "slice", "cup", "g", "ml", "serving". */
  unit: z.string(),
  /** Total edible weight estimate. */
  grams: z.number(),
  preparation: z.string().nullable(),
  /** "assumed large eggs (50 g each)". */
  assumptions: z.array(z.string()),
  confidence: confidenceSchema,
  /** Id of a library food reused for consistency, or null. */
  matched_food_id: z.string().nullable(),
  /** Brand, retailer or chain when the person named one ("Asda", "M&S", "Greggs"); else null. */
  brand: z.string().nullable(),
  /** The product page the values were read from when the item was looked up online; else null. */
  source_url: z.string().nullable(),
  nutrients: nutrientVectorSchema,
  food_groups: foodGroupServesSchema,
})
export type FoodItem = z.infer<typeof foodItemSchema>

export const foodEstimateSchema = z.object({
  items: z.array(foodItemSchema),
  meal_hint: mealSchema.nullable(),
  overall_confidence: confidenceSchema,
  /** Only when the ambiguity materially changes the numbers; otherwise null. */
  clarifying_question: z.string().nullable(),
})
export type FoodEstimate = z.infer<typeof foodEstimateSchema>

export const AI_PURPOSES = ['explain_plan', 'estimate', 'weekly_review'] as const
export const aiPurposeSchema = z.enum(AI_PURPOSES)
export type AiPurpose = z.infer<typeof aiPurposeSchema>

/**
 * Purpose `weekly_review` (slice 4): a short structured reading of the last seven days,
 * built only from the supplied day scores, gaps and targets. Exactly two changes, ranked.
 */
export const weeklyReviewChangeSchema = z.object({
  title: z.string(),
  why: z.string(),
  how: z.string(),
})
export type WeeklyReviewChange = z.infer<typeof weeklyReviewChangeSchema>

export const weeklyReviewSchema = z.object({
  /** Two sentences on the week. */
  summary: z.string(),
  /** 1 to 3 things that went well. */
  wins: z.array(z.string()),
  /** Exactly 2, ranked. */
  changes: z.array(weeklyReviewChangeSchema),
  /** One sentence, specific, not saccharine. */
  encouragement: z.string(),
})
export type WeeklyReview = z.infer<typeof weeklyReviewSchema>

export const storedWeeklyReviewSchema = z.object({
  ...weeklyReviewSchema.shape,
  model: z.string(),
  generatedAt: z.iso.datetime(),
  /** The last day of the seven-day window the review covers. */
  weekEnd: z.iso.date(),
  daysLogged: z.number().int().min(0),
})
export type StoredWeeklyReview = z.infer<typeof storedWeeklyReviewSchema>
