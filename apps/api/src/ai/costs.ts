import {
  AI_COSTS_DAYS,
  aiCostsResponseSchema,
  type AiCostRow,
  type AiCostsResponse,
} from '@diet-tracker/shared'
import { desc, eq, gte, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { isOwner } from '../auth/owner.js'
import { requireAuth } from '../auth/session-middleware.js'
import { db } from '../db/client.js'
import { aiCalls, users } from '../db/schema/index.js'
import { errors } from '../errors.js'
import type { AppEnv } from '../types.js'

/**
 * The owner's cost view (slice 11c): every `ai_calls` row of the last `AI_COSTS_DAYS`
 * days folded by person and purpose. Counts and tokens only; prices move, so the money is
 * the owner's sum. `userId` is null for a call made with no signed-in person.
 */
export async function aiCosts(now: Date = new Date()): Promise<AiCostsResponse> {
  const since = new Date(now.getTime() - AI_COSTS_DAYS * 24 * 60 * 60 * 1000)
  const rows = await db
    .select({
      userId: aiCalls.userId,
      email: users.email,
      purpose: aiCalls.purpose,
      calls: sql<number>`count(*)::int`,
      failed: sql<number>`count(*) filter (where not ${aiCalls.ok})::int`,
      inputTokens: sql<number>`coalesce(sum(${aiCalls.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${aiCalls.outputTokens}), 0)::int`,
      webSearchCalls: sql<number>`coalesce(sum(${aiCalls.webSearchCalls}), 0)::int`,
    })
    .from(aiCalls)
    .leftJoin(users, eq(users.id, aiCalls.userId))
    .where(gte(aiCalls.createdAt, since))
    .groupBy(aiCalls.userId, users.email, aiCalls.purpose)
    .orderBy(desc(sql`count(*)`), users.email, aiCalls.purpose)
  const list: AiCostRow[] = rows.map((row) => ({
    userId: row.userId,
    email: row.email,
    purpose: row.purpose,
    calls: row.calls,
    failed: row.failed,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    webSearchCalls: row.webSearchCalls,
  }))
  return aiCostsResponseSchema.parse({
    days: AI_COSTS_DAYS,
    since: since.toISOString(),
    rows: list,
  })
}

/** `GET /api/v1/ai/costs`: owner only; anyone else, and every deployment without `OWNER_EMAIL`, gets 404. */
export const aiCostsRoutes = new Hono<AppEnv>().get('/costs', async (c) => {
  const { user } = requireAuth(c)
  if (!isOwner(user.email)) throw errors.notFound()
  return c.json(await aiCosts(), 200)
})
