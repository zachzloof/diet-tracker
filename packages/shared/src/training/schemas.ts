import { z } from 'zod'
import {
  exerciseKindSchema,
  exerciseMeasureSchema,
  muscleGroupSchema,
  type ExerciseMeasure,
} from './enums.js'

/** Wire shapes for `/api/v1/exercises` and `/api/v1/workouts` (D35). */

const shortText = (max: number) => z.string().trim().max(max)

export const MAX_CUSTOM_EXERCISES = 200
export const MAX_WORKOUT_EXERCISES = 30
export const MAX_SETS_PER_EXERCISE = 30
export const MAX_SET_WEIGHT_KG = 1000
export const MAX_SET_REPS = 1000
export const MAX_SET_DURATION_S = 24 * 60 * 60
export const MAX_SET_DISTANCE_M = 1_000_000
/** The longest range one `GET /workouts` may ask for, in days. */
export const MAX_WORKOUTS_RANGE_DAYS = 92
export const MAX_EXERCISE_HISTORY = 20

// --- Exercises ----------------------------------------------------------------------------

const exerciseName = z
  .string({ error: 'Give the exercise a name' })
  .trim()
  .min(1, 'Give the exercise a name')
  .max(80, 'Keep the name under 80 characters')

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

export const exerciseInputSchema = z.object({
  name: exerciseName,
  kind: exerciseKindSchema,
  muscleGroups: z
    .array(muscleGroupSchema)
    .max(4, 'Pick up to four muscle groups')
    .transform(unique),
  measures: z
    .array(exerciseMeasureSchema)
    .min(1, 'Pick what a set records')
    .transform(unique)
    .pipe(z.array(exerciseMeasureSchema).min(1, 'Pick what a set records')),
})
export type ExerciseInput = z.infer<typeof exerciseInputSchema>

export const exerciseSchema = z.object({
  id: z.uuid(),
  name: exerciseName,
  kind: exerciseKindSchema,
  muscleGroups: z.array(muscleGroupSchema),
  measures: z.array(exerciseMeasureSchema),
  /** True for the person's own exercises; false for the shared catalogue. */
  custom: z.boolean(),
  lastUsedAt: z.iso.datetime().nullable(),
})
export type Exercise = z.infer<typeof exerciseSchema>

export const exercisesResponseSchema = z.object({ exercises: z.array(exerciseSchema) })
export type ExercisesResponse = z.infer<typeof exercisesResponseSchema>
export const exerciseResponseSchema = z.object({ exercise: exerciseSchema })
export type ExerciseResponse = z.infer<typeof exerciseResponseSchema>

// --- Workouts -----------------------------------------------------------------------------

/**
 * One set. Which fields are filled depends on the exercise's measures; the rest are null.
 * Units are canonical: kilograms, reps, seconds, metres. A warm-up set is kept but never
 * counts towards volume or best sets.
 */
export const workoutSetSchema = z.object({
  id: z.uuid(),
  weightKg: z
    .number()
    .min(0, 'Weight cannot be negative')
    .max(MAX_SET_WEIGHT_KG, `Weight should be under ${MAX_SET_WEIGHT_KG} kg`)
    .nullable(),
  reps: z
    .number()
    .int('Reps are whole numbers')
    .min(0, 'Reps cannot be negative')
    .max(MAX_SET_REPS, `Reps should be under ${MAX_SET_REPS}`)
    .nullable(),
  durationS: z.number().int().min(0).max(MAX_SET_DURATION_S).nullable(),
  distanceM: z.number().min(0).max(MAX_SET_DISTANCE_M).nullable(),
  rpe: z.number().min(1).max(10).nullable(),
  isWarmup: z.boolean(),
  completed: z.boolean(),
})
export type WorkoutSet = z.infer<typeof workoutSetSchema>

/**
 * One exercise block in a session, in order. `exerciseId` points at the catalogue or a custom
 * exercise and is the key for progress; `exerciseName` is a snapshot so the block still reads
 * after a custom exercise is deleted (D35).
 */
export const workoutExerciseInputSchema = z.object({
  id: z.uuid(),
  exerciseId: z.uuid().nullable(),
  exerciseName: exerciseName,
  notes: shortText(500),
  sets: z
    .array(workoutSetSchema)
    .max(MAX_SETS_PER_EXERCISE, `An exercise can have up to ${MAX_SETS_PER_EXERCISE} sets`),
})
export type WorkoutExerciseInput = z.infer<typeof workoutExerciseInputSchema>

/** The session document the phone sends with `PUT /workouts/:id`; the id is in the path. */
export const workoutInputSchema = z.object({
  /** The user's local day the session belongs to, set by the client like a log entry's. */
  day: z.iso.date(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  /** Empty means "Workout"; the screens fill the default. */
  title: shortText(60),
  notes: shortText(1000),
  /** How it felt, 1 (rough) to 5 (great), or null when not asked. */
  feel: z.number().int().min(1).max(5).nullable(),
  exercises: z
    .array(workoutExerciseInputSchema)
    .max(MAX_WORKOUT_EXERCISES, `A session can have up to ${MAX_WORKOUT_EXERCISES} exercises`),
})
export type WorkoutInput = z.infer<typeof workoutInputSchema>

export const workoutExerciseSchema = workoutExerciseInputSchema
export type WorkoutExercise = z.infer<typeof workoutExerciseSchema>

export const workoutSchema = workoutInputSchema.extend({
  id: z.uuid(),
  exercises: z.array(workoutExerciseSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type Workout = z.infer<typeof workoutSchema>

export const workoutsQuerySchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
})
export type WorkoutsQuery = z.infer<typeof workoutsQuerySchema>

export const workoutsResponseSchema = z.object({ workouts: z.array(workoutSchema) })
export type WorkoutsResponse = z.infer<typeof workoutsResponseSchema>
export const workoutResponseSchema = z.object({ workout: workoutSchema })
export type WorkoutResponse = z.infer<typeof workoutResponseSchema>

/** The sets of one exercise in one past session, newest session first in a history. */
export const exerciseHistoryEntrySchema = z.object({
  workoutId: z.uuid(),
  day: z.iso.date(),
  title: z.string(),
  sets: z.array(workoutSetSchema),
})
export type ExerciseHistoryEntry = z.infer<typeof exerciseHistoryEntrySchema>

export const exerciseHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_EXERCISE_HISTORY).default(5),
})
export const exerciseHistoryResponseSchema = z.object({
  history: z.array(exerciseHistoryEntrySchema),
})
export type ExerciseHistoryResponse = z.infer<typeof exerciseHistoryResponseSchema>

/** The measures a block shows, from its exercise when known, else weight and reps. */
export const DEFAULT_MEASURES: readonly ExerciseMeasure[] = ['weight', 'reps']
