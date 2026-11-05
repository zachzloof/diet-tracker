/**
 * What an OpenAI call costs, for the owner's cost view (D42). List prices in US dollars per
 * million tokens, standard tier, copied from https://developers.openai.com/api/docs/pricing
 * on `AI_PRICES_AS_OF`. Prices change: when OpenAI moves one, or `OPENAI_MODEL` /
 * `OPENAI_COACH_MODEL` is set to a model that is not here, update this table and the date.
 * A call on a model with no entry is never guessed at; the view counts it as unpriced.
 */

export interface ModelPrice {
  /** Input tokens that were not read from the prompt cache. */
  input: number
  /** Input tokens read from the prompt cache; null when the model has no cached rate. */
  cachedInput: number | null
  /** Output tokens, reasoning included. */
  output: number
}

/** The day the table below was read off OpenAI's pricing page. */
export const AI_PRICES_AS_OF = '2026-11-05'

export const AI_MODEL_PRICES_USD_PER_M: Readonly<Record<string, ModelPrice>> = {
  'gpt-6-astra': { input: 10, cachedInput: 1, output: 50 },
  'gpt-6-sol': { input: 2, cachedInput: 0.2, output: 10 },
  'gpt-6-luna': { input: 0.1, cachedInput: 0.01, output: 0.5 },
  'gpt-6.1-sol': { input: 2, cachedInput: 0.1, output: 10 },
  'gpt-6.1-terra': { input: 1, cachedInput: 0.05, output: 5 },
  'gpt-5.6-sol': { input: 4, cachedInput: 0.4, output: 20 },
  'gpt-5.6-terra': { input: 2, cachedInput: 0.2, output: 12 },
  'gpt-5.6-luna': { input: 0.2, cachedInput: 0.02, output: 1.2 },
  'gpt-5.5': { input: 5, cachedInput: 0.5, output: 30 },
  'gpt-5.5-pro': { input: 30, cachedInput: null, output: 180 },
  'gpt-5.4': { input: 2.5, cachedInput: 0.25, output: 15 },
  'gpt-5.4-pro': { input: 30, cachedInput: null, output: 180 },
  'gpt-5.4-mini': { input: 0.75, cachedInput: 0.075, output: 4.5 },
  'gpt-5.4-nano': { input: 0.2, cachedInput: 0.02, output: 1.25 },
  'gpt-5.2': { input: 1.75, cachedInput: 0.175, output: 14 },
  'gpt-5.1': { input: 1.25, cachedInput: 0.125, output: 10 },
  'gpt-5': { input: 1.25, cachedInput: 0.125, output: 10 },
  'gpt-5-mini': { input: 0.25, cachedInput: 0.025, output: 2 },
  'gpt-5-nano': { input: 0.05, cachedInput: 0.005, output: 0.4 },
}

/** The web search tool, per call; the pages it reads are already in the input tokens. */
export const WEB_SEARCH_USD_PER_CALL = 0.01

/**
 * The price of a model as `ai_calls.model` names it. The API answers with a dated snapshot
 * ("gpt-5.5-2026-04-23"), so a trailing date is dropped; nothing else is matched loosely,
 * or "gpt-5-mini" would be charged as "gpt-5".
 */
export function modelPrice(model: string): ModelPrice | null {
  const name = model.replace(/-\d{4}-\d{2}-\d{2}$/, '')
  return AI_MODEL_PRICES_USD_PER_M[name] ?? null
}

export interface AiUsage {
  /** All input tokens, cached ones included, as OpenAI reports them. */
  inputTokens: number
  /** The part of `inputTokens` read from the prompt cache. */
  cachedInputTokens: number
  outputTokens: number
  webSearchCalls: number
}

export interface AiCost {
  inputUsd: number
  outputUsd: number
  searchUsd: number
}

/** What that usage costs on that model, or null when the model has no listed price. */
export function aiCostUsd(model: string, usage: AiUsage): AiCost | null {
  const price = modelPrice(model)
  if (!price) return null
  const cached = Math.min(Math.max(0, usage.cachedInputTokens), usage.inputTokens)
  const fresh = usage.inputTokens - cached
  return {
    inputUsd: (fresh * price.input + cached * (price.cachedInput ?? price.input)) / 1_000_000,
    outputUsd: (usage.outputTokens * price.output) / 1_000_000,
    searchUsd: usage.webSearchCalls * WEB_SEARCH_USD_PER_CALL,
  }
}
