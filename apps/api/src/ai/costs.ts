import {
  AI_COSTS_DAYS,
  AI_PRICES_AS_OF,
  aiCostUsd,
  aiCostsResponseSchema,
  type AiCostRow,
  type AiCostsResponse,
} from '@diet-tracker/shared'
import { eq, gte, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { isOwner } from '../auth/owner.js'
import { requireAuth } from '../auth/session-middleware.js'
import { db } from '../db/client.js'
import { aiCalls, users } from '../db/schema/index.js'
import { env } from '../env.js'
import { errors } from '../errors.js'
import type { AppEnv } from '../types.js'

/**
 * The owner's cost view (slice 11c): every `ai_calls` row of the last `AI_COSTS_DAYS`
 * days folded by person and purpose, in tokens and in dollars. The rows are summed per
 * model first, because each model has its own price (`aiCostUsd`, list prices dated
 * `AI_PRICES_AS_OF`); a model with no listed price adds to `unpricedCalls` and to no
 * money. Rows logged before 2026-11-05 carry no cached-token count and are priced as if
 * nothing was cached, which reads high. `userId` is null for a call made with no
 * signed-in person.
 */
export async function aiCosts(now: Date = new Date()): Promise<AiCostsResponse> {
  const since = new Date(now.getTime() - AI_COSTS_DAYS * 24 * 60 * 60 * 1000)
  const sums = await db
    .select({
      userId: aiCalls.userId,
      email: users.email,
      purpose: aiCalls.purpose,
      model: aiCalls.model,
      calls: sql<number>`count(*)::int`,
      failed: sql<number>`count(*) filter (where not ${aiCalls.ok})::int`,
      inputTokens: sql<number>`coalesce(sum(${aiCalls.inputTokens}), 0)::int`,
      cachedInputTokens: sql<number>`coalesce(sum(${aiCalls.cachedInputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${aiCalls.outputTokens}), 0)::int`,
      webSearchCalls: sql<number>`coalesce(sum(${aiCalls.webSearchCalls}), 0)::int`,
    })
    .from(aiCalls)
    .leftJoin(users, eq(users.id, aiCalls.userId))
    .where(gte(aiCalls.createdAt, since))
    .groupBy(aiCalls.userId, users.email, aiCalls.purpose, aiCalls.model)

  const rows = new Map<string, AiCostRow>()
  for (const sum of sums) {
    const key = `${sum.userId ?? ''}|${sum.purpose}`
    const row = rows.get(key) ?? {
      userId: sum.userId,
      email: sum.email,
      purpose: sum.purpose,
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
    row.calls += sum.calls
    row.failed += sum.failed
    row.inputTokens += sum.inputTokens
    row.cachedInputTokens += sum.cachedInputTokens
    row.outputTokens += sum.outputTokens
    row.webSearchCalls += sum.webSearchCalls
    const cost = aiCostUsd(sum.model, sum)
    if (cost) {
      row.inputCostUsd += cost.inputUsd
      row.outputCostUsd += cost.outputUsd
      row.searchCostUsd += cost.searchUsd
    } else {
      row.unpricedCalls += sum.calls
    }
    rows.set(key, row)
  }
  const list = [...rows.values()].sort(
    (a, b) =>
      b.calls - a.calls ||
      (a.email ?? '').localeCompare(b.email ?? '') ||
      a.purpose.localeCompare(b.purpose),
  )
  return aiCostsResponseSchema.parse({
    days: AI_COSTS_DAYS,
    since: since.toISOString(),
    pricesAsOf: AI_PRICES_AS_OF,
    usdToGbp: env.USD_TO_GBP,
    rows: list,
  })
}

/** `GET /api/v1/ai/costs`: owner only; anyone else, and every deployment without `OWNER_EMAIL`, gets 404. */
export const aiCostsRoutes = new Hono<AppEnv>().get('/costs', async (c) => {
  const { user } = requireAuth(c)
  if (!isOwner(user.email)) throw errors.notFound()
  return c.json(await aiCosts(), 200)
})
