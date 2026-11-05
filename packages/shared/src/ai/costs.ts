import { z } from 'zod'
import { aiPurposeSchema } from './schemas.js'

/**
 * The owner's cost view (slice 11c): `ai_calls` for the last `AI_COSTS_DAYS` days grouped
 * by person and purpose, in tokens and in money. Each call is priced on the server from
 * OpenAI's list prices for its model (`pricing.ts`, dated `pricesAsOf`), in dollars as
 * OpenAI bills; the screen turns that into pounds with `usdToGbp`. Behind
 * `GET /api/v1/ai/costs`, answered only for the account named by `OWNER_EMAIL`.
 */

export const AI_COSTS_DAYS = 30

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
  /** The part of `inputTokens` read from the prompt cache (0 where it was not recorded). */
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
})
export type AiCostRow = z.infer<typeof aiCostRowSchema>

export const aiCostsResponseSchema = z.object({
  days: z.number().int().positive(),
  /** The start of the window, an instant. */
  since: z.iso.datetime(),
  /** The day the list prices were read (`AI_PRICES_AS_OF`). */
  pricesAsOf: z.iso.date(),
  /** Pounds per dollar (`USD_TO_GBP`). */
  usdToGbp: z.number().positive(),
  /** Most calls first. */
  rows: z.array(aiCostRowSchema),
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
] as const satisfies readonly (keyof AiCostTotals)[]

export function sumAiCosts(rows: readonly AiCostTotals[]): AiCostTotals {
  const totals: AiCostTotals = {
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
  }
  for (const row of rows) for (const key of TOTAL_KEYS) totals[key] += row[key]
  return totals
}

/** Tokens and searches together, in dollars. */
export function totalAiCostUsd(
  totals: Pick<AiCostTotals, 'inputCostUsd' | 'outputCostUsd' | 'searchCostUsd'>,
): number {
  return totals.inputCostUsd + totals.outputCostUsd + totals.searchCostUsd
}

/** Rows folded by one key (purpose or person), most calls first. */
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
    .sort((a, b) => b.totals.calls - a.totals.calls)
}
