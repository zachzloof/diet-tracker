import type { ExerciseKind, ExerciseMeasure, MuscleGroup } from '@diet-tracker/shared'
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { users } from './auth.js'

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })
/** User-local calendar days are `date` columns read and written as `YYYY-MM-DD` strings. */
const day = (name: string) => date(name, { mode: 'string' })

/**
 * The exercise catalogue (D35): shared rows have a null `user_id` and fixed ids written by
 * the migration; a person's own exercises carry their id. Like `foods`, but the id is the
 * key for history rather than a snapshot source: a chart needs the same exercise across months.
 */
export const exercises = pgTable(
  'exercises',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind').$type<ExerciseKind>().notNull(),
    muscleGroups: jsonb('muscle_groups').$type<MuscleGroup[]>().notNull(),
    measures: jsonb('measures').$type<ExerciseMeasure[]>().notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [index('exercises_user_name_idx').on(t.userId, t.name)],
)

/** One gym session on one user-local day. Kept until deleted (D36), not purged at six months. */
export const workouts = pgTable(
  'workouts',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The user's local day the session belongs to; sent by the client, never from server time. */
    day: day('day').notNull(),
    startedAt: timestamptz('started_at').notNull(),
    endedAt: timestamptz('ended_at'),
    title: text('title').notNull(),
    notes: text('notes').notNull().default(''),
    feel: integer('feel'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [index('workouts_user_day_idx').on(t.userId, t.day)],
)

/**
 * One exercise block in a session, in order. `exercise_id` is the key for progress and is
 * cleared when a custom exercise is deleted; `exercise_name` keeps the block readable.
 */
export const workoutExercises = pgTable(
  'workout_exercises',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workoutId: uuid('workout_id')
      .notNull()
      .references(() => workouts.id, { onDelete: 'cascade' }),
    exerciseId: uuid('exercise_id').references(() => exercises.id, { onDelete: 'set null' }),
    exerciseName: text('exercise_name').notNull(),
    /** Order within the session, from 0. */
    position: integer('position').notNull(),
    notes: text('notes').notNull().default(''),
  },
  (t) => [
    index('workout_exercises_workout_idx').on(t.workoutId, t.position),
    index('workout_exercises_user_exercise_idx').on(t.userId, t.exerciseId),
  ],
)

/** One set. Canonical units: kg, reps, seconds, metres. Unused measures are null. */
export const workoutSets = pgTable(
  'workout_sets',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workoutExerciseId: uuid('workout_exercise_id')
      .notNull()
      .references(() => workoutExercises.id, { onDelete: 'cascade' }),
    /** Order within the block, from 0. */
    position: integer('position').notNull(),
    weightKg: doublePrecision('weight_kg'),
    reps: integer('reps'),
    durationS: integer('duration_s'),
    distanceM: doublePrecision('distance_m'),
    rpe: doublePrecision('rpe'),
    isWarmup: boolean('is_warmup').notNull().default(false),
    completed: boolean('completed').notNull().default(false),
  },
  (t) => [index('workout_sets_block_idx').on(t.workoutExerciseId, t.position)],
)

export type ExerciseRow = typeof exercises.$inferSelect
export type WorkoutRow = typeof workouts.$inferSelect
export type WorkoutExerciseRow = typeof workoutExercises.$inferSelect
export type NewWorkoutExerciseRow = typeof workoutExercises.$inferInsert
export type WorkoutSetRow = typeof workoutSets.$inferSelect
export type NewWorkoutSetRow = typeof workoutSets.$inferInsert
