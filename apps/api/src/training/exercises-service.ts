import {
  MAX_CUSTOM_EXERCISES,
  bodyweightLoadKg,
  defaultBodyweightShare,
  exerciseHistoryEntrySchema,
  exerciseSchema,
  type Exercise,
  type ExerciseHistoryEntry,
  type ExerciseInput,
} from '@diet-tracker/shared'
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { db } from '../db/client.js'
import { EXERCISE_CATALOGUE } from '../db/exercise-catalogue.js'
import {
  exercises,
  workoutExercises,
  workoutSets,
  workouts,
  type ExerciseRow,
} from '../db/schema/index.js'
import { errors } from '../errors.js'
import type { Tx } from '../profile/targets-service.js'
import { bodyWeightOn } from '../progress/weight-service.js'
import { toWireSet } from './wire.js'

/**
 * The exercise catalogue (D35): shared rows (null user) from the migration plus the person's
 * own. "Recent first" in the picker is per person, so it comes from their workouts rather
 * than a column on the shared row.
 */

/** A catalogue row or one of this person's. */
const visibleTo = (userId: string) => or(isNull(exercises.userId), eq(exercises.userId, userId))

/** `lastUsedAt` comes back from the aggregate as text, so either form is accepted. */
export function toWireExercise(
  row: ExerciseRow,
  lastUsedAt: Date | string | null = null,
): Exercise {
  return exerciseSchema.parse({
    id: row.id,
    name: row.name,
    kind: row.kind,
    muscleGroups: row.muscleGroups,
    measures: row.measures,
    bodyweightShare: row.bodyweightShare,
    custom: row.userId !== null,
    lastUsedAt: lastUsedAt === null ? null : new Date(lastUsedAt).toISOString(),
  })
}

/** Catalogue and custom exercises, most recently used by this person first, then by name. */
export async function listExercises(userId: string): Promise<Exercise[]> {
  const lastUsed = db
    .select({
      exerciseId: workoutExercises.exerciseId,
      lastUsedAt: sql<string>`max(${workouts.startedAt})`.as('last_used_at'),
    })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(eq(workoutExercises.userId, userId))
    .groupBy(workoutExercises.exerciseId)
    .as('last_used')
  const rows = await db
    .select({ exercise: exercises, lastUsedAt: lastUsed.lastUsedAt })
    .from(exercises)
    .leftJoin(lastUsed, eq(lastUsed.exerciseId, exercises.id))
    .where(visibleTo(userId))
    .orderBy(sql`${lastUsed.lastUsedAt} desc nulls last`, sql`lower(${exercises.name})`)
  return rows.map((row) => toWireExercise(row.exercise, row.lastUsedAt))
}

/** The columns of a person's own exercise; a share left out follows the kind and measures (D44). */
function ownExerciseFields(input: ExerciseInput) {
  return {
    ...input,
    bodyweightShare: input.bodyweightShare ?? defaultBodyweightShare(input.kind, input.measures),
  }
}

export async function createExercise(
  userId: string,
  input: ExerciseInput,
  now: Date = new Date(),
): Promise<Exercise> {
  return db.transaction(async (tx) => {
    const counted = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(exercises)
      .where(eq(exercises.userId, userId))
    if ((counted[0]?.count ?? 0) >= MAX_CUSTOM_EXERCISES) {
      throw errors.conflict(
        `You can add up to ${MAX_CUSTOM_EXERCISES} exercises of your own. Delete one you no longer use to add another.`,
      )
    }
    const inserted = await tx
      .insert(exercises)
      .values({ id: uuidv7(), userId, ...ownExerciseFields(input), createdAt: now, updatedAt: now })
      .returning()
    const row = inserted[0]
    if (!row) throw new Error('exercise insert returned no row')
    return toWireExercise(row)
  })
}

/**
 * Only a person's own exercises can change; a catalogue id reads as not found. An edit
 * reaches the sessions already logged, in the same transaction: a new name replaces the
 * snapshot on every block (it is the same exercise, renamed), and a new bodyweight share
 * re-works their loads (`restampBlocks`), since the share is a rule about the exercise and
 * not a fact about the day.
 */
export async function updateExercise(
  userId: string,
  id: string,
  input: ExerciseInput,
  now: Date = new Date(),
): Promise<Exercise> {
  return db.transaction(async (tx) => {
    const mine = and(eq(exercises.id, id), eq(exercises.userId, userId))
    const existing = await tx.select().from(exercises).where(mine).for('update')
    const before = existing[0]
    if (!before) throw errors.notFound()
    const fields = ownExerciseFields(input)
    const updated = await tx
      .update(exercises)
      .set({ ...fields, updatedAt: now })
      .where(mine)
      .returning()
    const row = updated[0]
    if (!row) throw new Error('exercise update returned no row')
    if (row.name !== before.name) {
      await tx.update(workoutExercises).set({ exerciseName: row.name }).where(blocksOf(userId, id))
    }
    if (row.bodyweightShare !== before.bodyweightShare) {
      await restampBlocks(tx, userId, id, before.bodyweightShare, row.bodyweightShare)
    }
    return toWireExercise(row)
  })
}

/** This person's session blocks of one exercise. */
const blocksOf = (userId: string, exerciseId: string) =>
  and(eq(workoutExercises.userId, userId), eq(workoutExercises.exerciseId, exerciseId))

/**
 * Re-works the bodyweight load of every logged block of an exercise whose share changed
 * (D44). A block that has a load is rescaled, which keeps the body weight it was worked out
 * from; one that has none (the share was 0) is worked out from the person's weight on its
 * session's day; a share of 0 clears them.
 */
async function restampBlocks(
  tx: Tx,
  userId: string,
  exerciseId: string,
  from: number,
  to: number,
): Promise<void> {
  const blocks = blocksOf(userId, exerciseId)
  if (!(to > 0)) {
    await tx.update(workoutExercises).set({ bodyweightKg: null }).where(blocks)
    return
  }
  if (from > 0) {
    await tx
      .update(workoutExercises)
      .set({
        bodyweightKg: sql`round((${workoutExercises.bodyweightKg} * ${to / from})::numeric, 1)::double precision`,
      })
      .where(and(blocks, isNotNull(workoutExercises.bodyweightKg)))
  }
  const unstamped = await tx
    .select({ id: workoutExercises.id, day: workouts.day })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(and(blocks, isNull(workoutExercises.bodyweightKg)))
  const byDay = new Map<string, string[]>()
  for (const block of unstamped) {
    byDay.set(block.day, [...(byDay.get(block.day) ?? []), block.id])
  }
  for (const [day, ids] of byDay) {
    const bodyweightKg = bodyweightLoadKg(to, await bodyWeightOn(tx, userId, day))
    if (bodyweightKg === null) continue
    await tx.update(workoutExercises).set({ bodyweightKg }).where(inArray(workoutExercises.id, ids))
  }
}

/** Past sessions keep the exercise's name; their link to it is cleared by the foreign key. */
export async function deleteExercise(userId: string, id: string): Promise<void> {
  const deleted = await db
    .delete(exercises)
    .where(and(eq(exercises.id, id), eq(exercises.userId, userId)))
    .returning({ id: exercises.id })
  if (deleted.length === 0) throw errors.notFound()
}

/**
 * Of `ids`, the ones this person may log against (the catalogue and their own), each with
 * the share of bodyweight it lifts.
 */
export async function usableExerciseShares(
  tx: Tx,
  userId: string,
  ids: readonly string[],
): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map()
  const rows = await tx
    .select({ id: exercises.id, bodyweightShare: exercises.bodyweightShare })
    .from(exercises)
    .where(and(visibleTo(userId), inArray(exercises.id, [...ids])))
  return new Map(rows.map((row) => [row.id, row.bodyweightShare]))
}

/**
 * The person's recent sessions with this exercise, newest first, each with its sets in
 * order: at most `limit`, and none before `from` when it is given. The session screen
 * reads the newest few for Last and Best; the lift page reads a range of up to a year.
 */
export async function exerciseHistory(
  userId: string,
  exerciseId: string,
  limit: number,
  from?: string,
): Promise<ExerciseHistoryEntry[]> {
  const blocks = await db
    .select({
      blockId: workoutExercises.id,
      bodyweightKg: workoutExercises.bodyweightKg,
      workoutId: workouts.id,
      day: workouts.day,
      title: workouts.title,
    })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(
      and(
        eq(workoutExercises.userId, userId),
        eq(workoutExercises.exerciseId, exerciseId),
        from === undefined ? undefined : gte(workouts.day, from),
      ),
    )
    .orderBy(desc(workouts.day), desc(workouts.startedAt), desc(workoutExercises.position))
    .limit(limit)
  if (blocks.length === 0) return []
  const sets = await db
    .select()
    .from(workoutSets)
    .where(
      inArray(
        workoutSets.workoutExerciseId,
        blocks.map((block) => block.blockId),
      ),
    )
    .orderBy(asc(workoutSets.position))
  const setsByBlock = new Map<string, typeof sets>()
  for (const set of sets) {
    const list = setsByBlock.get(set.workoutExerciseId)
    if (list) list.push(set)
    else setsByBlock.set(set.workoutExerciseId, [set])
  }
  return blocks.map((block) =>
    exerciseHistoryEntrySchema.parse({
      workoutId: block.workoutId,
      day: block.day,
      title: block.title,
      bodyweightKg: block.bodyweightKg,
      sets: (setsByBlock.get(block.blockId) ?? []).map(toWireSet),
    }),
  )
}

/**
 * Puts the shared catalogue back after a test truncation (`truncate users cascade` empties
 * every table that references `users`, the catalogue's among them). Production gets the
 * rows from the migration; this is idempotent either way.
 */
export async function ensureExerciseCatalogue(tx: Tx = db): Promise<void> {
  await tx
    .insert(exercises)
    .values(EXERCISE_CATALOGUE.map((entry) => ({ ...entry, userId: null })))
    .onConflictDoNothing()
}
