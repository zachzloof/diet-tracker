import type { AiPurpose } from '@diet-tracker/shared'
import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { v7 as uuidv7 } from 'uuid'
import type { ZodType } from 'zod'
import { db } from '../db/client.js'
import { aiCalls } from '../db/schema/index.js'
import { env } from '../env.js'
import { errors } from '../errors.js'
import { logger } from '../logger.js'

/**
 * The one place the API talks to OpenAI (ai-food-estimation skill). Responses API,
 * Structured Outputs against a zod schema from `@diet-tracker/shared`, a 30 s timeout with
 * one retry on 429 or 5xx, and an `ai_calls` row for every attempt's outcome.
 */

export const AI_TIMEOUT_MS = 30_000
const RETRY_BACKOFF_MS = 2_000

let client: OpenAI | null = null

export function aiConfigured(): boolean {
  return typeof env.OPENAI_API_KEY === 'string' && env.OPENAI_API_KEY.length > 0
}

function getClient(): OpenAI {
  if (!aiConfigured()) throw errors.aiUnavailable()
  client ??= new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: AI_TIMEOUT_MS, maxRetries: 0 })
  return client
}

/** Reasoning models take an effort hint; other models reject the parameter. */
function reasoningOptions(model: string): { reasoning: { effort: 'low' } } | Record<never, never> {
  return /^(gpt-5|o\d)/.test(model) ? { reasoning: { effort: 'low' } } : {}
}

export interface StructuredCall<T> {
  purpose: AiPurpose
  userId: string | null
  /** JSON schema name shown to the model; snake_case. */
  schemaName: string
  schema: ZodType<T>
  system: string
  user: string
  maxOutputTokens?: number
}

export interface StructuredResult<T> {
  data: T
  model: string
  inputTokens: number | null
  outputTokens: number | null
  latencyMs: number
}

function isRetryable(error: unknown): boolean {
  if (error instanceof OpenAI.APIError) {
    const status = error.status ?? 0
    return status === 429 || status >= 500
  }
  return (
    error instanceof OpenAI.APIConnectionError || error instanceof OpenAI.APIConnectionTimeoutError
  )
}

function describe(error: unknown): string {
  if (error instanceof OpenAI.APIError) return `${error.status ?? 'network'}: ${error.message}`
  if (error instanceof Error) return error.message
  return String(error)
}

async function logCall(row: {
  userId: string | null
  purpose: AiPurpose
  model: string
  inputTokens: number | null
  outputTokens: number | null
  latencyMs: number
  ok: boolean
  error: string | null
}): Promise<void> {
  try {
    await db.insert(aiCalls).values({ id: uuidv7(), ...row })
  } catch (dbError) {
    logger.error({ err: dbError }, 'failed to log ai call')
  }
  logger.info(
    {
      purpose: row.purpose,
      model: row.model,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      latencyMs: row.latencyMs,
      ok: row.ok,
      error: row.error,
    },
    'ai call',
  )
}

export async function callStructured<T>(call: StructuredCall<T>): Promise<StructuredResult<T>> {
  const openai = getClient()
  const model = env.OPENAI_MODEL

  for (let attempt = 1; attempt <= 2; attempt++) {
    const start = performance.now()
    try {
      const response = await openai.responses.parse({
        model,
        input: [
          { role: 'system', content: call.system },
          { role: 'user', content: call.user },
        ],
        text: { format: zodTextFormat(call.schema, call.schemaName) },
        max_output_tokens: call.maxOutputTokens ?? 1200,
        store: false,
        ...reasoningOptions(model),
      })
      const latencyMs = Math.round(performance.now() - start)
      const inputTokens = response.usage?.input_tokens ?? null
      const outputTokens = response.usage?.output_tokens ?? null
      const parsed = response.output_parsed

      if (parsed === null || parsed === undefined) {
        const refusal = response.output
          .flatMap((item) => (item.type === 'message' ? item.content : []))
          .find((part) => part.type === 'refusal')
        const error = refusal
          ? `refusal: ${refusal.refusal}`
          : `no parsed output (status ${response.status ?? 'unknown'}, ${response.incomplete_details?.reason ?? 'complete'})`
        await logCall({
          userId: call.userId,
          purpose: call.purpose,
          model: response.model,
          inputTokens,
          outputTokens,
          latencyMs,
          ok: false,
          error,
        })
        if (attempt === 1 && !refusal) continue
        throw errors.aiUnavailable()
      }

      await logCall({
        userId: call.userId,
        purpose: call.purpose,
        model: response.model,
        inputTokens,
        outputTokens,
        latencyMs,
        ok: true,
        error: null,
      })
      return { data: parsed, model: response.model, inputTokens, outputTokens, latencyMs }
    } catch (error) {
      if (error instanceof Error && error.name === 'AppError') throw error
      const latencyMs = Math.round(performance.now() - start)
      await logCall({
        userId: call.userId,
        purpose: call.purpose,
        model,
        inputTokens: null,
        outputTokens: null,
        latencyMs,
        ok: false,
        error: describe(error).slice(0, 500),
      })
      if (attempt === 1 && isRetryable(error)) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS))
        continue
      }
      logger.warn({ err: error, purpose: call.purpose }, 'ai call failed')
      throw errors.aiUnavailable()
    }
  }
  throw errors.aiUnavailable()
}
