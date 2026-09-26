import {
  PACE_KG_PER_WEEK,
  addDays,
  localDay,
  weightEntrySchema,
  type Profile,
  type UpsertWeightRequest,
  type WeightEntry,
  type WeightResponse,
  type WeightsQuery,
  type WeightsResponse,
} from '@diet-tracker/shared'
import { and, asc, between, desc, eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { db } from '../db/client.js'
import { profiles, weightEntries, type WeightEntryRow } from '../db/schema/index.js'
import { errors } from '../errors.js'

/**
 * Weigh-ins (slice 5). One row per user and local day. A weigh-in that is the newest one
 * also updates the profile weight so Profile and You show it, but it never creates a
 * target version: recalibration is the only path from weight data to targets (D19).
 */

export function toWireWeight(row: WeightEntryRow): WeightEntry {
  return weightEntrySchema.parse({
    id: row.id,
    day: row.day,
    weightKg: row.weightKg,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  })
}

export async function listWeights(
  userId: string,
  profile: Profile,
  query: WeightsQuery,
  now: Date = new Date(),
): Promise<WeightsResponse> {
  const today = localDay(now, profile.timezone)
  const start = addDays(today, -(query.days - 1))
  const rows = await db
    .select()
    .from(weightEntries)
    .where(and(eq(weightEntries.userId, userId), between(weightEntries.day, start, today)))
    .orderBy(asc(weightEntries.day))
  return {
    today,
    entries: rows.map(toWireWeight),
    goalWeightKg: profile.goalWeightKg,
    expectedKgPerWeek: profile.pace ? PACE_KG_PER_WEEK[profile.pace] : 0,
  }
}

/** Every weigh-in, oldest first (export and recalibration). */
export async function allWeights(userId: string): Promise<WeightEntryRow[]> {
  return db
    .select()
    .from(weightEntries)
    .where(eq(weightEntries.userId, userId))
    .orderBy(asc(weightEntries.day))
}

export async function upsertWeight(
  userId: string,
  profile: Profile,
  input: UpsertWeightRequest,
  now: Date = new Date(),
): Promise<WeightResponse> {
  const today = localDay(now, profile.timezone)
  if (input.day > today) {
    throw errors.validation({
      fieldErrors: { day: ['That day has not happened yet'] },
      formErrors: [],
    })
  }
  const weightKg = Math.round(input.weightKg * 10) / 10
  return db.transaction(async (tx) => {
    const row = (
      await tx
        .insert(weightEntries)
        .values({
          id: uuidv7(),
          userId,
          day: input.day,
          weightKg,
          note: input.note,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: [weightEntries.userId, weightEntries.day],
          set: { weightKg, note: input.note },
        })
        .returning()
    )[0]
    if (!row) throw new Error('weight upsert returned no row')

    const newest = (
      await tx
        .select({ day: weightEntries.day })
        .from(weightEntries)
        .where(eq(weightEntries.userId, userId))
        .orderBy(desc(weightEntries.day))
        .limit(1)
    )[0]
    const profileWeightUpdated = newest?.day === input.day && profile.weightKg !== weightKg
    if (profileWeightUpdated) {
      await tx.update(profiles).set({ weightKg, updatedAt: now }).where(eq(profiles.userId, userId))
    }
    return { entry: toWireWeight(row), profileWeightUpdated }
  })
}

export async function deleteWeight(userId: string, day: string): Promise<void> {
  const deleted = await db
    .delete(weightEntries)
    .where(and(eq(weightEntries.userId, userId), eq(weightEntries.day, day)))
    .returning({ id: weightEntries.id })
  if (deleted.length === 0) throw errors.notFound()
}
