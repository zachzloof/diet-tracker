import { z } from 'zod'
import { foodEstimateSchema } from '../ai/schemas.js'
import { foodGroupServesSchema, nutrientVectorSchema } from '../nutrition/nutrients.js'
import {
  confidenceSchema,
  entrySourceSchema,
  foodBasisSchema,
  foodSourceSchema,
  mealSchema,
} from './enums.js'

/** Wire shapes for `/api/v1/foods`, `/api/v1/log` and `/api/v1/ai/estimate`. */

const foodName = z
  .string({ error: 'Give the food a name' })
  .trim()
  .min(1, 'Give the food a name')
  .max(120, 'Keep the name under 120 characters')
const shortText = (max: number) => z.string().trim().max(max)

export const MAX_SERVING_GRAMS = 5000
export const MAX_ENTRY_GRAMS = 20_000
export const MAX_ENTRY_QUANTITY = 10_000

// --- Foods library ------------------------------------------------------------------------

const foodFields = {
  name: foodName,
  brand: shortText(80).nullable(),
  basis: foodBasisSchema,
  servingGrams: z
    .number()
    .positive('Serving size must be above 0 g')
    .max(MAX_SERVING_GRAMS, `Serving size should be under ${MAX_SERVING_GRAMS} g`)
    .nullable(),
  servingLabel: shortText(40).nullable(),
  nutrients: nutrientVectorSchema,
  foodGroups: foodGroupServesSchema,
}

/** The manual-entry form. A per-serving food must say how many grams a serving is. */
export const foodInputSchema = z.object(foodFields).superRefine((value, ctx) => {
  if (value.basis === 'per_serving' && value.servingGrams === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['servingGrams'],
      message: 'Enter the grams in one serving',
    })
  }
})
export type FoodInput = z.infer<typeof foodInputSchema>

export const foodSchema = z.object({
  id: z.uuid(),
  ...foodFields,
  source: foodSourceSchema,
  /** True for manual entries and AI estimates the person confirmed or edited. */
  verified: z.boolean(),
  lastUsedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type Food = z.infer<typeof foodSchema>

export const MAX_FOOD_QUERY_CHARS = 80
export const foodsQuerySchema = z.object({
  q: z.string().trim().max(MAX_FOOD_QUERY_CHARS).default(''),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})
export type FoodsQuery = z.infer<typeof foodsQuerySchema>

export const foodsResponseSchema = z.object({ foods: z.array(foodSchema) })
export type FoodsResponse = z.infer<typeof foodsResponseSchema>
export const foodResponseSchema = z.object({ food: foodSchema })
export type FoodResponse = z.infer<typeof foodResponseSchema>

// --- AI estimate ---------------------------------------------------------------------------

export const MAX_ESTIMATE_CHARS = 500

export const estimateRequestSchema = z.object({
  text: z
    .string({ error: 'Type what you ate' })
    .trim()
    .min(1, 'Type what you ate')
    .max(MAX_ESTIMATE_CHARS, `Keep it under ${MAX_ESTIMATE_CHARS} characters`),
  /** When the food was eaten (defaults to now). Sets the suggested day and meal. */
  at: z.iso.datetime().optional(),
})
export type EstimateRequest = z.infer<typeof estimateRequestSchema>

export const estimateResponseSchema = z.object({
  estimate: foodEstimateSchema,
  /** The `ai_calls` row of the successful call, for the entries to reference. */
  aiCallId: z.uuid().nullable(),
  /** The user's local day at `at`, and the previous day when it was before the late-night cutoff. */
  day: z.iso.date(),
  previousDay: z.iso.date().nullable(),
  /** The model's meal hint if it gave one, otherwise inferred from the local time. */
  meal: mealSchema,
  callsRemaining: z.number().int().min(0),
})
export type EstimateResponse = z.infer<typeof estimateResponseSchema>

/** `details` on an `ai_cap_reached` error. */
export const aiCapDetailsSchema = z.object({ cap: z.number().int(), used: z.number().int() })

// --- Log entries ---------------------------------------------------------------------------

const entryFields = {
  name: foodName,
  quantity: z.number().positive('Quantity must be above 0').max(MAX_ENTRY_QUANTITY),
  unit: z.string().trim().min(1).max(30),
  /** Total edible grams for the logged quantity. */
  grams: z.number().min(0).max(MAX_ENTRY_GRAMS),
  /** For the total logged quantity (CLAUDE.md conventions). */
  nutrients: nutrientVectorSchema,
  foodGroups: foodGroupServesSchema,
}

export const logEntryInputSchema = z.object({
  ...entryFields,
  source: entrySourceSchema,
  foodId: z.uuid().nullable(),
  aiCallId: z.uuid().nullable(),
  assumptions: z.array(z.string().trim().max(200)).max(10),
  confidence: confidenceSchema.nullable(),
  /** Save this item to My foods (as a per-serving food of `grams` grams) as well as logging it. */
  saveToLibrary: z.boolean().default(false),
})
export type LogEntryInput = z.infer<typeof logEntryInputSchema>

export const MAX_ENTRIES_PER_REQUEST = 20

export const createEntriesRequestSchema = z.object({
  day: z.iso.date(),
  meal: mealSchema,
  loggedAt: z.iso.datetime(),
  entries: z.array(logEntryInputSchema).min(1, 'Nothing to log').max(MAX_ENTRIES_PER_REQUEST),
})
export type CreateEntriesRequest = z.infer<typeof createEntriesRequestSchema>

export const logEntrySchema = z.object({
  id: z.uuid(),
  day: z.iso.date(),
  loggedAt: z.iso.datetime(),
  meal: mealSchema,
  ...entryFields,
  source: entrySourceSchema,
  foodId: z.uuid().nullable(),
  aiCallId: z.uuid().nullable(),
  assumptions: z.array(z.string()),
  confidence: confidenceSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type LogEntry = z.infer<typeof logEntrySchema>

export const dailySummarySchema = z.object({
  day: z.iso.date(),
  totals: nutrientVectorSchema,
  foodGroups: foodGroupServesSchema,
  entryCount: z.number().int().min(0),
})
export type DailySummary = z.infer<typeof dailySummarySchema>

export const dayLogResponseSchema = z.object({
  day: z.iso.date(),
  entries: z.array(logEntrySchema),
  summary: dailySummarySchema,
})
export type DayLogResponse = z.infer<typeof dayLogResponseSchema>

export const createEntriesResponseSchema = z.object({
  entries: z.array(logEntrySchema),
  summary: dailySummarySchema,
  foodsSaved: z.number().int().min(0),
})
export type CreateEntriesResponse = z.infer<typeof createEntriesResponseSchema>

/**
 * Edit an entry. Send `quantity`, `grams`, `nutrients` and `foodGroups` together to change
 * how much was eaten (the client rescales with `rescaleToQuantity`); `meal` or `day` to
 * move it. Every field is optional but at least one must be present.
 */
export const updateEntryRequestSchema = z
  .object({
    name: foodName,
    quantity: entryFields.quantity,
    grams: entryFields.grams,
    nutrients: nutrientVectorSchema,
    foodGroups: foodGroupServesSchema,
    meal: mealSchema,
    day: z.iso.date(),
  })
  .partial()
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    message: 'Nothing to change',
  })
export type UpdateEntryRequest = z.infer<typeof updateEntryRequestSchema>

export const updateEntryResponseSchema = z.object({
  entry: logEntrySchema,
  /** The summary of every day touched: one, or two when the entry moved days. */
  summaries: z.array(dailySummarySchema),
})
export type UpdateEntryResponse = z.infer<typeof updateEntryResponseSchema>

export const deleteEntryResponseSchema = z.object({ summary: dailySummarySchema })
export type DeleteEntryResponse = z.infer<typeof deleteEntryResponseSchema>
