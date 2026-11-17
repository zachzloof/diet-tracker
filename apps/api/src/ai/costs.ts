import {
  AI_COST_PERIOD_DAYS,
  AI_PRICES_AS_OF,
  addDays,
  aiCostUsd,
  aiCostWindow,
  aiCostsQuerySchema,
  aiCostsResponseSchema,
  cachedShare,
  daysBetween,
  isValidTimeZone,
  localDay,
  pricedModelName,
  type AiCostPeriod,
  type AiCostRow,
  type AiCostsResponse,
  type AiModelCost,
} from '@diet-tracker/shared'
import { eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { isOwner } from '../auth/owner.js'
import { requireAuth } from '../auth/session-middleware.js'
import { db } from '../db/client.js'
import { aiCalls, profiles, users } from '../db/schema/index.js'
import { env } from '../env.js'
import { errors, validationDetails } from '../errors.js'
import type { AppEnv } from '../types.js'
import { billedCosts } from './billing.js'

/**
 * The owner's cost view (slice 11c, D42, D45). Every `ai_calls` row is summed by the
 * owner's local day, person, purpose and model, then priced per model (`aiCostUsd`, list
 * prices dated `AI_PRICES_AS_OF`) and folded into the window the owner picked: by person and
 * purpose, by model, by day, and the same-length window before it. A model with no listed
 * price adds to `unpricedCalls` and to no money.
 *
 * Calls logged before 2026-11-05 have no cached-token count. Pricing them as if nothing was
 * cached reads several times too high for the coach, whose prompt is mostly cache hits, so
 * they take the cached share of the calls of the same purpose and model that did record it
 * (`cachedShare`, over all time) and are counted in `estimatedCalls`. With no such calls
 * they are priced uncached, the upper bound.
 */

/** A zone name safe to write into the SQL as a literal: a real IANA zone of plain characters. */
function safeZone(zone: string | undefined): string {
  return zone && /^[A-Za-z0-9_+\-/]+$/.test(zone) && isValidTimeZone(zone) ? zone : 'UTC'
}

interface Sum {
  day: string
  userId: string | null
  email: string | null
  purpose: AiCostRow['purpose']
  model: string
  recorded: boolean
  calls: number
  failed: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  webSearchCalls: number
}

function emptyRow(sum: Sum): AiCostRow {
  return {
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
    estimatedCalls: 0,
  }
}

export async function aiCosts(
  ownerId: string,
  period: AiCostPeriod,
  now: Date = new Date(),
): Promise<AiCostsResponse> {
  const [profile] = await db
    .select({ timezone: profiles.timezone })
    .from(profiles)
    .where(eq(profiles.userId, ownerId))
    .limit(1)
  const timezone = safeZone(profile?.timezone)
  const today = localDay(now, timezone)

  // The zone is a checked literal, so the day expression is identical in select and group by.
  const day = sql<string>`to_char(${aiCalls.createdAt} at time zone ${sql.raw(`'${timezone}'`)}, 'YYYY-MM-DD')`
  const recorded = sql<boolean>`(${aiCalls.cachedInputTokens} is not null)`
  const sums: Sum[] = await db
    .select({
      day,
      userId: aiCalls.userId,
      email: users.email,
      purpose: aiCalls.purpose,
      model: aiCalls.model,
      recorded,
      calls: sql<number>`count(*)::int`,
      failed: sql<number>`count(*) filter (where not ${aiCalls.ok})::int`,
      inputTokens: sql<number>`coalesce(sum(${aiCalls.inputTokens}), 0)::int`,
      cachedInputTokens: sql<number>`coalesce(sum(${aiCalls.cachedInputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${aiCalls.outputTokens}), 0)::int`,
      webSearchCalls: sql<number>`coalesce(sum(${aiCalls.webSearchCalls}), 0)::int`,
    })
    .from(aiCalls)
    .leftJoin(users, eq(users.id, aiCalls.userId))
    .groupBy(day, aiCalls.userId, users.email, aiCalls.purpose, aiCalls.model, recorded)

  // The cached share each purpose and model shows where it was recorded, over all time.
  const recordedTokens = new Map<string, { inputTokens: number; cachedInputTokens: number }>()
  let firstDay: string | null = null
  for (const sum of sums) {
    if (firstDay === null || sum.day < firstDay) firstDay = sum.day
    if (!sum.recorded) continue
    const key = `${sum.purpose}|${pricedModelName(sum.model)}`
    const seen = recordedTokens.get(key) ?? { inputTokens: 0, cachedInputTokens: 0 }
    seen.inputTokens += sum.inputTokens
    seen.cachedInputTokens += sum.cachedInputTokens
    recordedTokens.set(key, seen)
  }

  const { from, to } = aiCostWindow(period, today, firstDay)
  const days = daysBetween(from, to) + 1
  const previous =
    period === 'all'
      ? null
      : {
          from: addDays(from, -AI_COST_PERIOD_DAYS[period]),
          to: addDays(from, -1),
          calls: 0,
          costUsd: 0,
        }

  const rows = new Map<string, AiCostRow>()
  const models = new Map<string, AiModelCost>()
  const daily = new Map<string, { calls: number; costUsd: number }>()
  for (let i = 0; i < days; i++) daily.set(addDays(from, i), { calls: 0, costUsd: 0 })

  for (const sum of sums) {
    const inWindow = sum.day >= from && sum.day <= to
    const inPrevious = previous !== null && sum.day >= previous.from && sum.day <= previous.to
    if (!inWindow && !inPrevious) continue

    const modelName = pricedModelName(sum.model)
    const estimated = !sum.recorded && sum.inputTokens > 0
    const share = estimated
      ? (cachedShare(
          recordedTokens.get(`${sum.purpose}|${modelName}`) ?? {
            inputTokens: 0,
            cachedInputTokens: 0,
          },
        ) ?? 0)
      : null
    const cachedInputTokens =
      share === null ? sum.cachedInputTokens : Math.round(sum.inputTokens * share)
    const cost = aiCostUsd(sum.model, { ...sum, cachedInputTokens })
    const costUsd = cost ? cost.inputUsd + cost.outputUsd + cost.searchUsd : 0

    if (inPrevious && previous) {
      previous.calls += sum.calls
      previous.costUsd += costUsd
      continue
    }

    const key = `${sum.userId ?? ''}|${sum.purpose}`
    const row = rows.get(key) ?? emptyRow(sum)
    row.calls += sum.calls
    row.failed += sum.failed
    row.inputTokens += sum.inputTokens
    row.cachedInputTokens += cachedInputTokens
    row.outputTokens += sum.outputTokens
    row.webSearchCalls += sum.webSearchCalls
    if (estimated) row.estimatedCalls += sum.calls
    if (cost) {
      row.inputCostUsd += cost.inputUsd
      row.outputCostUsd += cost.outputUsd
      row.searchCostUsd += cost.searchUsd
    } else {
      row.unpricedCalls += sum.calls
    }
    rows.set(key, row)

    const model = models.get(modelName) ?? {
      model: modelName,
      calls: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      webSearchCalls: 0,
      costUsd: 0,
      priced: cost !== null,
    }
    model.calls += sum.calls
    model.inputTokens += sum.inputTokens
    model.cachedInputTokens += cachedInputTokens
    model.outputTokens += sum.outputTokens
    model.webSearchCalls += sum.webSearchCalls
    model.costUsd += costUsd
    models.set(modelName, model)

    const bucket = daily.get(sum.day)
    if (bucket) {
      bucket.calls += sum.calls
      bucket.costUsd += costUsd
    }
  }

  const rowList = [...rows.values()].sort(
    (a, b) =>
      b.inputCostUsd +
        b.outputCostUsd +
        b.searchCostUsd -
        (a.inputCostUsd + a.outputCostUsd + a.searchCostUsd) ||
      b.calls - a.calls ||
      (a.email ?? '').localeCompare(b.email ?? '') ||
      a.purpose.localeCompare(b.purpose),
  )
  return aiCostsResponseSchema.parse({
    period,
    from,
    to,
    days,
    timezone,
    pricesAsOf: AI_PRICES_AS_OF,
    usdToGbp: env.USD_TO_GBP,
    rows: rowList,
    models: [...models.values()].sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls),
    daily: [...daily.entries()].map(([d, bucket]) => ({ day: d, ...bucket })),
    previous,
    billed: await billedCosts(from, to, now.getTime()),
  })
}

/** `GET /api/v1/ai/costs?period=`: owner only; anyone else, and every deployment without `OWNER_EMAIL`, gets 404. */
export const aiCostsRoutes = new Hono<AppEnv>().get('/costs', async (c) => {
  const { user } = requireAuth(c)
  if (!isOwner(user.email)) throw errors.notFound()
  const query = aiCostsQuerySchema.safeParse(c.req.query())
  if (!query.success) throw errors.validation(validationDetails(query.error))
  return c.json(await aiCosts(user.id, query.data.period), 200)
})
