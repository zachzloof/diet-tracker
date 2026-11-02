import { z } from 'zod'
import { aiPurposeSchema } from './schemas.js'

/**
 * The owner's cost view (slice 11c): `ai_calls` for the last `AI_COSTS_DAYS` days grouped
 * by person and purpose. Tokens and web searches are what OpenAI bills; prices change, so
 * the app shows counts and leaves the money to the owner. Behind `GET /api/v1/ai/costs`,
 * answered only for the account named by `OWNER_EMAIL`.
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
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  webSearchCalls: z.number().int().min(0),
})
export type AiCostRow = z.infer<typeof aiCostRowSchema>

export const aiCostsResponseSchema = z.object({
  days: z.number().int().positive(),
  /** The start of the window, an instant. */
  since: z.iso.datetime(),
  /** Most calls first. */
  rows: z.array(aiCostRowSchema),
})
export type AiCostsResponse = z.infer<typeof aiCostsResponseSchema>

export interface AiCostTotals {
  calls: number
  failed: number
  inputTokens: number
  outputTokens: number
  webSearchCalls: number
}

export function sumAiCosts(rows: readonly AiCostRow[]): AiCostTotals {
  const totals: AiCostTotals = {
    calls: 0,
    failed: 0,
    inputTokens: 0,
    outputTokens: 0,
    webSearchCalls: 0,
  }
  for (const row of rows) {
    totals.calls += row.calls
    totals.failed += row.failed
    totals.inputTokens += row.inputTokens
    totals.outputTokens += row.outputTokens
    totals.webSearchCalls += row.webSearchCalls
  }
  return totals
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
