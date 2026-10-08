import {
  MAX_CUSTOM_EXERCISES,
  exerciseHistoryEntrySchema,
  exerciseSchema,
  type Exercise,
  type ExerciseHistoryEntry,
  type ExerciseInput,
} from '@diet-tracker/shared'
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
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
      .values({ id: uuidv7(), userId, ...input, createdAt: now, updatedAt: now })
      .returning()
    const row = inserted[0]
    if (!row) throw new Error('exercise insert returned no row')
    return toWireExercise(row)
  })
}

/** Only a person's own exercises can change; a catalogue id reads as not found. */
export async function updateExercise(
  userId: string,
  id: string,
  input: ExerciseInput,
  now: Date = new Date(),
): Promise<Exercise> {
  const updated = await db
    .update(exercises)
    .set({ ...input, updatedAt: now })
    .where(and(eq(exercises.id, id), eq(exercises.userId, userId)))
    .returning()
  const row = updated[0]
  if (!row) throw errors.notFound()
  return toWireExercise(row)
}

/** Past sessions keep the exercise's name; their link to it is cleared by the foreign key. */
export async function deleteExercise(userId: string, id: string): Promise<void> {
  const deleted = await db
    .delete(exercises)
    .where(and(eq(exercises.id, id), eq(exercises.userId, userId)))
    .returning({ id: exercises.id })
  if (deleted.length === 0) throw errors.notFound()
}

/** Of `ids`, the ones this person may log against: the catalogue and their own. */
export async function usableExerciseIds(
  tx: Tx,
  userId: string,
  ids: readonly string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const rows = await tx
    .select({ id: exercises.id })
    .from(exercises)
    .where(and(visibleTo(userId), inArray(exercises.id, [...ids])))
  return new Set(rows.map((row) => row.id))
}

/**
 * The person's recent sessions with this exercise, newest first, each with its sets in
 * order. The session screen shows the newest as "last time"; progress charts read more.
 */
export async function exerciseHistory(
  userId: string,
  exerciseId: string,
  limit: number,
): Promise<ExerciseHistoryEntry[]> {
  const blocks = await db
    .select({
      blockId: workoutExercises.id,
      workoutId: workouts.id,
      day: workouts.day,
      title: workouts.title,
    })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(and(eq(workoutExercises.userId, userId), eq(workoutExercises.exerciseId, exerciseId)))
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
  return blocks.map((block) =>
    exerciseHistoryEntrySchema.parse({
      workoutId: block.workoutId,
      day: block.day,
      title: block.title,
      sets: sets.filter((set) => set.workoutExerciseId === block.blockId).map(toWireSet),
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
