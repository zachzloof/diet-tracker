import { z } from 'zod'
import { addDays } from '../dates.js'
import { aiPurposeSchema } from './schemas.js'

/**
 * The owner's cost view (slice 11c, D42, D45): `ai_calls` over a period the owner picks,
 * grouped by person and purpose, by model and by day, in tokens and in money. Each call is
 * priced on the server from OpenAI's list prices for its model (`pricing.ts`, dated
 * `pricesAsOf`), in dollars as OpenAI bills; the screen turns that into pounds with
 * `usdToGbp`. When the server holds an OpenAI admin key it also asks OpenAI what it actually
 * billed for the same days (`billed`), so the estimate can be checked against the bill.
 * Behind `GET /api/v1/ai/costs?period=`, answered only for the account named by `OWNER_EMAIL`.
 */

/** The windows the view offers, each ending today in the owner's time zone. */
export const AI_COST_PERIODS = ['today', '7d', '30d', '90d', 'all'] as const
export const aiCostPeriodSchema = z.enum(AI_COST_PERIODS)
export type AiCostPeriod = z.infer<typeof aiCostPeriodSchema>

/** Days in each fixed window; `all` runs from the first call ever logged. */
export const AI_COST_PERIOD_DAYS: Readonly<Record<Exclude<AiCostPeriod, 'all'>, number>> = {
  today: 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
}

export const AI_COST_PERIOD_LABELS: Readonly<Record<AiCostPeriod, string>> = {
  today: 'Today',
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
  all: 'All',
}

export const DEFAULT_AI_COST_PERIOD: AiCostPeriod = '7d'

export const aiCostsQuerySchema = z.object({
  period: aiCostPeriodSchema.default(DEFAULT_AI_COST_PERIOD),
})

export const aiCostRowSchema = z.object({
  /** Null for calls made without a signed-in person (none today; kept honest). */
  userId: z.uuid().nullable(),
  email: z.string().nullable(),
  purpose: aiPurposeSchema,
  calls: z.number().int().min(0),
  /** Attempts that did not produce an answer (`ok = false`). */
  failed: z.number().int().min(0),
  /** All input tokens, cached ones included. */
  inputTokens: z.number().int().min(0),
  /**
   * The part of `inputTokens` read from the prompt cache. For calls logged before the cache
   * count was recorded (2026-11-05) this holds the estimate `estimatedCalls` describes.
   */
  cachedInputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  webSearchCalls: z.number().int().min(0),
  /** Dollars for the input tokens, the cached ones at their lower rate. */
  inputCostUsd: z.number().min(0),
  outputCostUsd: z.number().min(0),
  /** Dollars for the web search calls; the pages read are in the input tokens. */
  searchCostUsd: z.number().min(0),
  /** Calls on a model with no listed price: counted in the tokens, left out of the money. */
  unpricedCalls: z.number().int().min(0),
  /**
   * Calls whose cached-token count was never recorded: their cache share is taken from the
   * calls of the same purpose and model that did record one, or none when there are none.
   */
  estimatedCalls: z.number().int().min(0),
})
export type AiCostRow = z.infer<typeof aiCostRowSchema>

export const aiModelCostSchema = z.object({
  /** The model as priced: a dated snapshot ("gpt-5.5-2026-04-23") reads as its model. */
  model: z.string(),
  calls: z.number().int().min(0),
  inputTokens: z.number().int().min(0),
  cachedInputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  webSearchCalls: z.number().int().min(0),
  costUsd: z.number().min(0),
  /** False when the model has no listed price; then `costUsd` is 0. */
  priced: z.boolean(),
})
export type AiModelCost = z.infer<typeof aiModelCostSchema>

export const aiCostDaySchema = z.object({
  day: z.iso.date(),
  calls: z.number().int().min(0),
  costUsd: z.number().min(0),
})
export type AiCostDay = z.infer<typeof aiCostDaySchema>

/** What OpenAI's own Costs API says was billed: the ground truth the estimate is checked on. */
export const aiBilledSchema = z.discriminatedUnion('status', [
  /** No `OPENAI_ADMIN_KEY` on the server. */
  z.object({ status: z.literal('off') }),
  z.object({
    status: z.literal('ok'),
    /** OpenAI buckets by UTC day; these are the UTC days asked for, inclusive. */
    from: z.iso.date(),
    to: z.iso.date(),
    /** The project whose spend this is (`OPENAI_PROJECT_ID`); null only from a test's fake. */
    projectId: z.string().nullable(),
    costUsd: z.number().min(0),
    daily: z.array(z.object({ day: z.iso.date(), costUsd: z.number().min(0) })),
    /** OpenAI's own line items ("gpt-5.5, input"), most expensive first. */
    lineItems: z.array(z.object({ lineItem: z.string(), costUsd: z.number().min(0) })),
  }),
  z.object({ status: z.literal('error'), message: z.string() }),
])
export type AiBilled = z.infer<typeof aiBilledSchema>

export const aiCostsResponseSchema = z.object({
  period: aiCostPeriodSchema,
  /** The window in the owner's time zone, both ends inclusive. */
  from: z.iso.date(),
  to: z.iso.date(),
  days: z.number().int().positive(),
  timezone: z.string(),
  /** The day the list prices were read (`AI_PRICES_AS_OF`). */
  pricesAsOf: z.iso.date(),
  /** Pounds per dollar (`USD_TO_GBP`). */
  usdToGbp: z.number().positive(),
  /** Person × purpose, most calls first. */
  rows: z.array(aiCostRowSchema),
  /** Most expensive first. */
  models: z.array(aiModelCostSchema),
  /** Every day of the window, oldest first, empty days included. */
  daily: z.array(aiCostDaySchema),
  /** The window of the same length just before this one; null for `all`. */
  previous: z
    .object({
      from: z.iso.date(),
      to: z.iso.date(),
      calls: z.number().int().min(0),
      costUsd: z.number().min(0),
    })
    .nullable(),
  billed: aiBilledSchema,
})
export type AiCostsResponse = z.infer<typeof aiCostsResponseSchema>

export interface AiCostTotals {
  calls: number
  failed: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  webSearchCalls: number
  inputCostUsd: number
  outputCostUsd: number
  searchCostUsd: number
  unpricedCalls: number
  estimatedCalls: number
}

const TOTAL_KEYS = [
  'calls',
  'failed',
  'inputTokens',
  'cachedInputTokens',
  'outputTokens',
  'webSearchCalls',
  'inputCostUsd',
  'outputCostUsd',
  'searchCostUsd',
  'unpricedCalls',
  'estimatedCalls',
] as const satisfies readonly (keyof AiCostTotals)[]

export function emptyAiCostTotals(): AiCostTotals {
  return {
    calls: 0,
    failed: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    webSearchCalls: 0,
    inputCostUsd: 0,
    outputCostUsd: 0,
    searchCostUsd: 0,
    unpricedCalls: 0,
    estimatedCalls: 0,
  }
}

export function sumAiCosts(rows: readonly AiCostTotals[]): AiCostTotals {
  const totals = emptyAiCostTotals()
  for (const row of rows) for (const key of TOTAL_KEYS) totals[key] += row[key]
  return totals
}

/** Tokens and searches together, in dollars. */
export function totalAiCostUsd(
  totals: Pick<AiCostTotals, 'inputCostUsd' | 'outputCostUsd' | 'searchCostUsd'>,
): number {
  return totals.inputCostUsd + totals.outputCostUsd + totals.searchCostUsd
}

/** Rows folded by one key (purpose or person), most expensive first, then most calls. */
export function groupAiCosts<K extends string>(
  rows: readonly AiCostRow[],
  keyOf: (row: AiCostRow) => K,
): { key: K; totals: AiCostTotals; rows: AiCostRow[] }[] {
  const groups = new Map<K, AiCostRow[]>()
  for (const row of rows) {
    const key = keyOf(row)
    const list = groups.get(key)
    if (list) list.push(row)
    else groups.set(key, [row])
  }
  return [...groups.entries()]
    .map(([key, list]) => ({ key, totals: sumAiCosts(list), rows: list }))
    .sort(
      (a, b) =>
        totalAiCostUsd(b.totals) - totalAiCostUsd(a.totals) || b.totals.calls - a.totals.calls,
    )
}

/**
 * The share of input tokens read from the cache, from the calls that recorded it: summed
 * cached over summed input. Null when none recorded any input, so nothing is guessed.
 */
export function cachedShare(recorded: {
  inputTokens: number
  cachedInputTokens: number
}): number | null {
  if (!(recorded.inputTokens > 0)) return null
  return Math.min(1, Math.max(0, recorded.cachedInputTokens / recorded.inputTokens))
}

/** The window a period covers, ending `today`; `firstDay` is the earliest call, for `all`. */
export function aiCostWindow(
  period: AiCostPeriod,
  today: string,
  firstDay: string | null,
): { from: string; to: string } {
  if (period === 'all') {
    return { from: firstDay !== null && firstDay < today ? firstDay : today, to: today }
  }
  return { from: addDays(today, -(AI_COST_PERIOD_DAYS[period] - 1)), to: today }
}
