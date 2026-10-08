import {
  dailySummarySchema,
  emptyFoodGroupServes,
  emptyNutrientVector,
  isWaterEntry,
  logEntrySchema,
  sumPortions,
  type CreateEntriesRequest,
  type CreateEntriesResponse,
  type DailySummary,
  type DayLogResponse,
  type DeleteEntryResponse,
  type DeleteGroupResponse,
  type LogEntry,
  type LogEntryInput,
  type UpdateEntryRequest,
  type UpdateEntryResponse,
  type UpdateGroupRequest,
  type UpdateGroupResponse,
} from '@diet-tracker/shared'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { db } from '../db/client.js'
import {
  aiCalls,
  dailySummaries,
  logEntries,
  type DailySummaryRow,
  type LogEntryRow,
} from '../db/schema/index.js'
import { errors } from '../errors.js'
import type { Tx } from '../profile/targets-service.js'
import { createFood, ownedFoodIds, touchFoods } from './foods-service.js'
import { createSavedMeal, touchSavedMeal } from './saved-meals-service.js'

/**
 * Log entries and the daily summary that shadows them. Every write recomputes the summary
 * for the affected day(s) inside the same transaction (db-schema skill), so reads never sum.
 */

export function toWireEntry(row: LogEntryRow): LogEntry {
  return logEntrySchema.parse({
    id: row.id,
    day: row.day,
    loggedAt: row.loggedAt.toISOString(),
    meal: row.meal,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    grams: row.grams,
    nutrients: row.nutrients,
    foodGroups: row.foodGroups,
    source: row.source,
    foodId: row.foodId,
    aiCallId: row.aiCallId,
    assumptions: row.assumptions,
    confidence: row.confidence,
    groupId: row.groupId,
    groupName: row.groupName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
}

export function toWireSummary(row: DailySummaryRow | null, day: string): DailySummary {
  return dailySummarySchema.parse(
    row
      ? { day: row.day, totals: row.totals, foodGroups: row.foodGroups, entryCount: row.entryCount }
      : { day, totals: emptyNutrientVector(), foodGroups: emptyFoodGroupServes(), entryCount: 0 },
  )
}

/** Sums the day's entries and upserts the summary row. Call inside the writing transaction. */
export async function recomputeSummary(
  tx: Tx,
  userId: string,
  day: string,
  now: Date,
): Promise<DailySummaryRow> {
  const rows = await tx
    .select({
      name: logEntries.name,
      unit: logEntries.unit,
      nutrients: logEntries.nutrients,
      foodGroups: logEntries.foodGroups,
    })
    .from(logEntries)
    .where(and(eq(logEntries.userId, userId), eq(logEntries.day, day)))
  const totals = sumPortions(rows)
  const values = {
    totals: totals.totals,
    foodGroups: totals.foodGroups,
    // Water quick-adds add to the totals but a day of water alone is still "unlogged".
    entryCount: rows.filter((row) => !isWaterEntry(row)).length,
    updatedAt: now,
  }
  const upserted = await tx
    .insert(dailySummaries)
    .values({ id: uuidv7(), userId, day, ...values })
    .onConflictDoUpdate({ target: [dailySummaries.userId, dailySummaries.day], set: values })
    .returning()
  const row = upserted[0]
  if (!row) throw new Error('daily summary upsert returned no row')
  return row
}

export async function getDay(userId: string, day: string): Promise<DayLogResponse> {
  const [entries, summaries] = await Promise.all([
    db
      .select()
      .from(logEntries)
      .where(and(eq(logEntries.userId, userId), eq(logEntries.day, day)))
      .orderBy(asc(logEntries.loggedAt), asc(logEntries.createdAt)),
    db
      .select()
      .from(dailySummaries)
      .where(and(eq(dailySummaries.userId, userId), eq(dailySummaries.day, day)))
      .limit(1),
  ])
  return {
    day,
    entries: entries.map(toWireEntry),
    summary: toWireSummary(summaries[0] ?? null, day),
  }
}

/** Ids of this user's own `ai_calls` rows among `ids`; a stranger's id is dropped, not rejected. */
async function ownedAiCallIds(tx: Tx, userId: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const rows = await tx
    .select({ id: aiCalls.id })
    .from(aiCalls)
    .where(and(eq(aiCalls.userId, userId), inArray(aiCalls.id, ids)))
  return new Set(rows.map((row) => row.id))
}

/** A logged item saved as a per-serving food: one serving is exactly what was logged. */
async function saveEntryAsFood(
  tx: Tx,
  userId: string,
  entry: Pick<
    LogEntryInput,
    'name' | 'brand' | 'quantity' | 'unit' | 'grams' | 'nutrients' | 'foodGroups' | 'source'
  >,
  now: Date,
): Promise<string> {
  const food = await createFood(
    userId,
    {
      name: entry.name,
      brand: entry.brand,
      basis: 'per_serving',
      servingGrams: entry.grams > 0 ? entry.grams : 1,
      servingLabel: `${trimNumber(entry.quantity)} ${entry.unit}`,
      nutrients: entry.nutrients,
      foodGroups: entry.foodGroups,
    },
    { source: entry.source === 'ai' ? 'ai' : 'manual', verified: true, now },
    tx,
  )
  return food.id
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '')
}

export async function createEntries(
  userId: string,
  request: CreateEntriesRequest,
  now: Date = new Date(),
): Promise<CreateEntriesResponse> {
  const loggedAt = new Date(request.loggedAt)
  return db.transaction(async (tx) => {
    const wantedFoodIds = request.entries.flatMap((e) => (e.foodId ? [e.foodId] : []))
    const owned = await ownedFoodIds(tx, userId, wantedFoodIds)
    const missing = wantedFoodIds.filter((id) => !owned.has(id))
    if (missing.length > 0) {
      throw errors.validation({
        fieldErrors: { foodId: ['That food is not in your library'] },
        formErrors: [],
      })
    }
    const aiIds = await ownedAiCallIds(
      tx,
      userId,
      request.entries.flatMap((e) => (e.aiCallId ? [e.aiCallId] : [])),
    )

    // Ingredients logged together as one meal share a group and carry the meal's name, so
    // the day log can show "Protein oats" as one row (D33). A saved meal id that is not this
    // person's (deleted, or a stranger's) logs the ingredients ungrouped rather than failing.
    const savedMealName = request.savedMealId
      ? await touchSavedMeal(tx, userId, request.savedMealId, now)
      : null
    const groupName = request.saveAsMeal?.name ?? savedMealName
    const groupId = groupName === null ? null : uuidv7()

    let foodsSaved = 0
    const rows = []
    for (const entry of request.entries) {
      let foodId = entry.foodId
      if (entry.saveToLibrary && !foodId) {
        foodId = await saveEntryAsFood(tx, userId, entry, now)
        foodsSaved += 1
      }
      rows.push({
        id: uuidv7(),
        userId,
        day: request.day,
        loggedAt,
        meal: request.meal,
        name: entry.name,
        quantity: entry.quantity,
        unit: entry.unit,
        grams: entry.grams,
        nutrients: entry.nutrients,
        foodGroups: entry.foodGroups,
        source: entry.source,
        foodId,
        aiCallId: entry.aiCallId && aiIds.has(entry.aiCallId) ? entry.aiCallId : null,
        assumptions: entry.assumptions,
        confidence: entry.confidence,
        groupId: isWaterEntry(entry) ? null : groupId,
        groupName: isWaterEntry(entry) ? null : groupName,
        createdAt: now,
        updatedAt: now,
      })
    }
    const inserted = await tx.insert(logEntries).values(rows).returning()
    await touchFoods(
      tx,
      userId,
      rows.flatMap((row) => (row.foodId ? [row.foodId] : [])),
      now,
    )
    // "Add to meals": the logged items become a saved meal, one portion as logged, in the same
    // transaction, so a meal never exists without its log and the links to the foods just
    // saved are kept. It counts as used now, so it sits at the top of Meals.
    const savedMeal = request.saveAsMeal
      ? await createSavedMeal(
          userId,
          {
            name: request.saveAsMeal.name,
            items: rows
              .filter((row) => !isWaterEntry(row))
              .map((row) => ({
                name: row.name,
                quantity: row.quantity,
                unit: row.unit,
                grams: row.grams,
                nutrients: row.nutrients,
                foodGroups: row.foodGroups,
                foodId: row.foodId,
              })),
          },
          now,
          { tx, lastUsedAt: now },
        )
      : null
    const summary = await recomputeSummary(tx, userId, request.day, now)
    return {
      entries: inserted.map(toWireEntry),
      summary: toWireSummary(summary, request.day),
      foodsSaved,
      savedMeal,
    }
  })
}

async function requireEntry(tx: Tx, userId: string, id: string): Promise<LogEntryRow> {
  const rows = await tx
    .select()
    .from(logEntries)
    .where(and(eq(logEntries.id, id), eq(logEntries.userId, userId)))
    .limit(1)
  const row = rows[0]
  if (!row) throw errors.notFound()
  return row
}

export async function updateEntry(
  userId: string,
  id: string,
  patch: UpdateEntryRequest,
  now: Date = new Date(),
): Promise<UpdateEntryResponse> {
  return db.transaction(async (tx) => {
    const current = await requireEntry(tx, userId, id)
    const moved =
      (patch.meal !== undefined && patch.meal !== current.meal) ||
      (patch.day !== undefined && patch.day !== current.day)
    let updated = (
      await tx
        .update(logEntries)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
          ...(patch.grams !== undefined ? { grams: patch.grams } : {}),
          ...(patch.nutrients !== undefined ? { nutrients: patch.nutrients } : {}),
          ...(patch.foodGroups !== undefined ? { foodGroups: patch.foodGroups } : {}),
          ...(patch.meal !== undefined ? { meal: patch.meal } : {}),
          ...(patch.day !== undefined ? { day: patch.day } : {}),
          // An ingredient moved on its own leaves the logged meal it was part of.
          ...(moved ? { groupId: null, groupName: null } : {}),
          updatedAt: now,
        })
        .where(eq(logEntries.id, id))
        .returning()
    )[0]
    if (!updated) throw errors.notFound()

    // Saved to My foods after the fact: the entry as it now stands becomes the food, once.
    // Entries keep no brand, so a named product relies on its name ("ASDA 10 Mozzarella Sticks").
    if (patch.saveToLibrary && updated.foodId === null) {
      const foodId = await saveEntryAsFood(tx, userId, { ...updated, brand: null }, now)
      await touchFoods(tx, userId, [foodId], now)
      updated =
        (await tx.update(logEntries).set({ foodId }).where(eq(logEntries.id, id)).returning())[0] ??
        updated
    }

    const days = [...new Set([current.day, updated.day])]
    const summaries = []
    for (const day of days) summaries.push(await recomputeSummary(tx, userId, day, now))
    return {
      entry: toWireEntry(updated),
      summaries: summaries.map((row) => toWireSummary(row, row.day)),
    }
  })
}

export async function deleteEntry(
  userId: string,
  id: string,
  now: Date = new Date(),
): Promise<DeleteEntryResponse> {
  return db.transaction(async (tx) => {
    const current = await requireEntry(tx, userId, id)
    await tx.delete(logEntries).where(eq(logEntries.id, id))
    const summary = await recomputeSummary(tx, userId, current.day, now)
    return { summary: toWireSummary(summary, current.day) }
  })
}

/** The entries of one logged meal, in log order; "not found" when none of them is this person's. */
async function requireGroup(tx: Tx, userId: string, groupId: string): Promise<LogEntryRow[]> {
  const rows = await tx
    .select()
    .from(logEntries)
    .where(and(eq(logEntries.groupId, groupId), eq(logEntries.userId, userId)))
    .orderBy(asc(logEntries.loggedAt), asc(logEntries.createdAt))
  if (rows.length === 0) throw errors.notFound()
  return rows
}

async function recomputeDays(
  tx: Tx,
  userId: string,
  days: Iterable<string>,
  now: Date,
): Promise<DailySummary[]> {
  const summaries = []
  for (const day of new Set(days)) summaries.push(await recomputeSummary(tx, userId, day, now))
  return summaries.map((row) => toWireSummary(row, row.day))
}

/** Moves every ingredient of a logged meal to another meal of the day, another day, or both. */
export async function updateGroup(
  userId: string,
  groupId: string,
  patch: UpdateGroupRequest,
  now: Date = new Date(),
): Promise<UpdateGroupResponse> {
  return db.transaction(async (tx) => {
    const current = await requireGroup(tx, userId, groupId)
    const updated = await tx
      .update(logEntries)
      .set({
        ...(patch.meal !== undefined ? { meal: patch.meal } : {}),
        ...(patch.day !== undefined ? { day: patch.day } : {}),
        updatedAt: now,
      })
      .where(and(eq(logEntries.groupId, groupId), eq(logEntries.userId, userId)))
      .returning()
    const byId = new Map(updated.map((row) => [row.id, row]))
    return {
      // Same order as the day log: the rows as `requireGroup` read them.
      entries: current.flatMap((row) => {
        const next = byId.get(row.id)
        return next ? [toWireEntry(next)] : []
      }),
      summaries: await recomputeDays(
        tx,
        userId,
        [...current.map((row) => row.day), ...updated.map((row) => row.day)],
        now,
      ),
    }
  })
}

/** Removes a whole logged meal, every ingredient at once. */
export async function deleteGroup(
  userId: string,
  groupId: string,
  now: Date = new Date(),
): Promise<DeleteGroupResponse> {
  return db.transaction(async (tx) => {
    const current = await requireGroup(tx, userId, groupId)
    await tx
      .delete(logEntries)
      .where(and(eq(logEntries.groupId, groupId), eq(logEntries.userId, userId)))
    return {
      summaries: await recomputeDays(
        tx,
        userId,
        current.map((row) => row.day),
        now,
      ),
    }
  })
}
