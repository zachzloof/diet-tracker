import { addDays, daysBetween, type AiBilled } from '@diet-tracker/shared'
import OpenAI from 'openai'
import { z } from 'zod'
import { env } from '../env.js'
import { logger } from '../logger.js'
import { describeAiError } from './openai.js'

/**
 * What OpenAI actually billed (D45): the organisation Costs API, read with an admin
 * key, so the owner's cost view can set its own estimate beside the bill. OpenAI buckets by
 * UTC day and the figures lag by a few hours. Off unless both `OPENAI_ADMIN_KEY` and
 * `OPENAI_PROJECT_ID` are set (the owner's call, D45): then only that project counts, and the
 * view is exactly as it was without them. Answers are kept ten minutes per window;
 * a failure is not kept.
 */

/** One page of the Costs API, as much of it as the view reads. Validated before use. */
const costsPageSchema = z.object({
  data: z.array(
    z.object({
      start_time: z.number(),
      results: z.array(
        z.object({
          amount: z
            .object({ value: z.coerce.number().optional(), currency: z.string().optional() })
            .nullish(),
          line_item: z.string().nullish(),
        }),
      ),
    }),
  ),
  has_more: z.boolean(),
  next_page: z.string().nullish(),
})
export type CostsPage = z.infer<typeof costsPageSchema>

export interface CostsQuery {
  start_time: number
  end_time: number
  bucket_width: '1d'
  group_by: ['line_item']
  limit: number
  project_ids?: string[]
  page?: string
}

/** Fetches one page; the tests swap in a fake through `openaiBilling.override`. */
export type CostsFetcher = (query: CostsQuery) => Promise<unknown>

export const openaiBilling: { override: CostsFetcher | null } = { override: null }

let admin: OpenAI | null = null
function realFetcher(adminKey: string): CostsFetcher {
  admin ??= new OpenAI({
    // The SDK wants an API key to construct; the Costs API itself authenticates with the
    // admin key, which is never sent to a model endpoint.
    apiKey: adminKey,
    adminAPIKey: adminKey,
    timeout: 15_000,
    maxRetries: 1,
  })
  const client = admin
  return (query) => client.admin.organization.usage.costs(query)
}

const CACHE_MS = 10 * 60_000
const cache = new Map<string, { at: number; value: AiBilled }>()

/** Forget cached answers (tests). */
export function clearBillingCache(): void {
  cache.clear()
}

const MAX_BUCKETS_PER_PAGE = 180
const MAX_PAGES = 12

function utcSeconds(day: string): number {
  return Date.parse(`${day}T00:00:00Z`) / 1000
}

function utcDay(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10)
}

/** OpenAI's bill for the UTC days `from`..`to` inclusive, or why it could not be read. */
export async function billedCosts(
  from: string,
  to: string,
  now: number = Date.now(),
): Promise<AiBilled> {
  const adminKey = env.OPENAI_ADMIN_KEY
  const override = openaiBilling.override
  // Both keys or nothing: an admin key alone would count the whole organisation.
  if (!override && !(adminKey && env.OPENAI_PROJECT_ID)) return { status: 'off' }
  const projectId = env.OPENAI_PROJECT_ID ?? null
  const key = `${from}|${to}|${projectId ?? ''}`
  const hit = cache.get(key)
  if (hit && now - hit.at < CACHE_MS) return hit.value

  const fetchPage = override ?? realFetcher(adminKey ?? '')
  const days = daysBetween(from, to) + 1
  const daily = new Map<string, number>()
  for (let i = 0; i < days; i++) daily.set(addDays(from, i), 0)
  const lineItems = new Map<string, number>()

  let value: AiBilled
  try {
    let page: string | undefined
    for (let n = 0; n < MAX_PAGES; n++) {
      const raw = await fetchPage({
        start_time: utcSeconds(from),
        end_time: utcSeconds(addDays(to, 1)),
        bucket_width: '1d',
        group_by: ['line_item'],
        limit: Math.min(MAX_BUCKETS_PER_PAGE, days),
        ...(projectId ? { project_ids: [projectId] } : {}),
        ...(page ? { page } : {}),
      })
      const parsed = costsPageSchema.parse(raw)
      for (const bucket of parsed.data) {
        const day = utcDay(bucket.start_time)
        for (const result of bucket.results) {
          const amount = result.amount?.value ?? 0
          const currency = result.amount?.currency ?? 'usd'
          if (currency.toLowerCase() !== 'usd') {
            throw new Error(`OpenAI answered in ${currency}, not dollars`)
          }
          if (!(amount > 0)) continue
          if (daily.has(day)) daily.set(day, (daily.get(day) ?? 0) + amount)
          const item = result.line_item ?? 'other'
          lineItems.set(item, (lineItems.get(item) ?? 0) + amount)
        }
      }
      if (!parsed.has_more || !parsed.next_page) break
      page = parsed.next_page
    }
    const dailyList = [...daily.entries()].map(([day, costUsd]) => ({ day, costUsd }))
    value = {
      status: 'ok',
      from,
      to,
      projectId,
      costUsd: dailyList.reduce((sum, d) => sum + d.costUsd, 0),
      daily: dailyList,
      lineItems: [...lineItems.entries()]
        .map(([lineItem, costUsd]) => ({ lineItem, costUsd }))
        .sort((a, b) => b.costUsd - a.costUsd),
    }
  } catch (error) {
    const message = describeAiError(error).slice(0, 300)
    logger.warn({ err: error }, 'openai costs api failed')
    // Not cached: the next open of the screen tries again.
    return { status: 'error', message }
  }
  cache.set(key, { at: now, value })
  return value
}
