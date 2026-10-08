import {
  MAX_WORKOUTS_RANGE_DAYS,
  daysBetween,
  workoutSchema,
  type Workout,
  type WorkoutInput,
  type WorkoutsQuery,
} from '@diet-tracker/shared'
import { and, asc, between, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../db/client.js'
import {
  workoutExercises,
  workoutSets,
  workouts,
  type NewWorkoutExerciseRow,
  type NewWorkoutSetRow,
  type WorkoutExerciseRow,
  type WorkoutRow,
  type WorkoutSetRow,
} from '../db/schema/index.js'
import { errors } from '../errors.js'
import type { Tx } from '../profile/targets-service.js'
import { usableExerciseIds } from './exercises-service.js'
import { toWireSet } from './wire.js'

/**
 * Workouts are documents (D35): the phone mints the id, keeps the session in local storage
 * and PUTs the whole thing after every change. The server replaces the blocks and sets in
 * one transaction, so a retry or a late duplicate can never leave half a session behind.
 */

const DEFAULT_TITLE = 'Workout'

function toWireWorkout(
  row: WorkoutRow,
  blocks: readonly WorkoutExerciseRow[],
  sets: readonly WorkoutSetRow[],
): Workout {
  return workoutSchema.parse({
    id: row.id,
    day: row.day,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    title: row.title,
    notes: row.notes,
    feel: row.feel,
    exercises: blocks
      .filter((block) => block.workoutId === row.id)
      .map((block) => ({
        id: block.id,
        exerciseId: block.exerciseId,
        exerciseName: block.exerciseName,
        notes: block.notes,
        sets: sets.filter((set) => set.workoutExerciseId === block.id).map(toWireSet),
      })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
}

/** Loads the blocks and sets of `rows` and assembles the documents in the rows' order. */
async function assemble(tx: Tx, rows: WorkoutRow[]): Promise<Workout[]> {
  if (rows.length === 0) return []
  const ids = rows.map((row) => row.id)
  const blocks = await tx
    .select()
    .from(workoutExercises)
    .where(inArray(workoutExercises.workoutId, ids))
    .orderBy(asc(workoutExercises.position))
  const sets =
    blocks.length === 0
      ? []
      : await tx
          .select()
          .from(workoutSets)
          .where(
            inArray(
              workoutSets.workoutExerciseId,
              blocks.map((block) => block.id),
            ),
          )
          .orderBy(asc(workoutSets.position))
  return rows.map((row) => toWireWorkout(row, blocks, sets))
}

/** Sessions between two user-local days inclusive, newest first. At most 92 days at once. */
export async function listWorkouts(userId: string, query: WorkoutsQuery): Promise<Workout[]> {
  const span = daysBetween(query.from, query.to)
  if (span < 0 || span >= MAX_WORKOUTS_RANGE_DAYS) {
    throw errors.validation({
      fieldErrors: { to: [`Ask for up to ${MAX_WORKOUTS_RANGE_DAYS} days at a time`] },
      formErrors: [],
    })
  }
  const rows = await db
    .select()
    .from(workouts)
    .where(and(eq(workouts.userId, userId), between(workouts.day, query.from, query.to)))
    .orderBy(desc(workouts.day), desc(workouts.startedAt))
  return assemble(db, rows)
}

export async function getWorkout(userId: string, id: string): Promise<Workout> {
  const rows = await db
    .select()
    .from(workouts)
    .where(and(eq(workouts.id, id), eq(workouts.userId, userId)))
  const row = rows[0]
  if (!row) throw errors.notFound()
  const [workout] = await assemble(db, [row])
  if (!workout) throw errors.notFound()
  return workout
}

export interface UpsertResult {
  workout: Workout
  created: boolean
}

/**
 * Creates or replaces the session with this id. An exercise id the person cannot use (a
 * custom exercise deleted meanwhile, or somebody else's) is kept as a name-only block rather
 * than failing the save: the numbers matter more than the link. An id that belongs to
 * another person's session reads as not found.
 */
export async function upsertWorkout(
  userId: string,
  id: string,
  input: WorkoutInput,
  now: Date = new Date(),
): Promise<UpsertResult> {
  return db.transaction(async (tx) => {
    const existing = await tx.select().from(workouts).where(eq(workouts.id, id))
    const current = existing[0]
    if (current && current.userId !== userId) throw errors.notFound()

    const fields = {
      day: input.day,
      startedAt: new Date(input.startedAt),
      endedAt: input.endedAt ? new Date(input.endedAt) : null,
      title: input.title || DEFAULT_TITLE,
      notes: input.notes,
      feel: input.feel,
      updatedAt: now,
    }
    const saved = current
      ? await tx.update(workouts).set(fields).where(eq(workouts.id, id)).returning()
      : await tx
          .insert(workouts)
          .values({ id, userId, ...fields, createdAt: now })
          .returning()
    const row = saved[0]
    if (!row) throw new Error('workout upsert returned no row')

    // Replace the document's body wholesale; the sets cascade with their blocks.
    await tx.delete(workoutExercises).where(eq(workoutExercises.workoutId, id))
    const usable = await usableExerciseIds(
      tx,
      userId,
      input.exercises.flatMap((block) => (block.exerciseId ? [block.exerciseId] : [])),
    )
    const blockRows: NewWorkoutExerciseRow[] = input.exercises.map((block, position) => ({
      id: block.id,
      userId,
      workoutId: id,
      exerciseId: block.exerciseId && usable.has(block.exerciseId) ? block.exerciseId : null,
      exerciseName: block.exerciseName,
      position,
      notes: block.notes,
    }))
    const setRows: NewWorkoutSetRow[] = input.exercises.flatMap((block) =>
      block.sets.map((set, position) => ({
        id: set.id,
        userId,
        workoutExerciseId: block.id,
        position,
        weightKg: set.weightKg,
        reps: set.reps,
        durationS: set.durationS,
        distanceM: set.distanceM,
        rpe: set.rpe,
        isWarmup: set.isWarmup,
        completed: set.completed,
      })),
    )
    const blocks = blockRows.length
      ? await tx.insert(workoutExercises).values(blockRows).returning()
      : []
    const sets = setRows.length ? await tx.insert(workoutSets).values(setRows).returning() : []
    return { workout: toWireWorkout(row, blocks, sets), created: !current }
  })
}

export async function deleteWorkout(userId: string, id: string): Promise<void> {
  const deleted = await db
    .delete(workouts)
    .where(and(eq(workouts.id, id), eq(workouts.userId, userId)))
    .returning({ id: workouts.id })
  if (deleted.length === 0) throw errors.notFound()
}

/** Every session, oldest first, for the account export. */
export async function allWorkouts(userId: string): Promise<Workout[]> {
  const rows = await db
    .select()
    .from(workouts)
    .where(eq(workouts.userId, userId))
    .orderBy(asc(workouts.day), asc(workouts.startedAt))
  return assemble(db, rows)
}
