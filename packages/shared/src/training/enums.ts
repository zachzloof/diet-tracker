import { z } from 'zod'

/**
 * Enums shared by the exercise catalogue and the session document. Stored as text (or a
 * JSONB list of text) in Postgres and validated here, so adding a value is a code change.
 */

/** The equipment, which decides what "weight" means on a set. */
export const EXERCISE_KINDS = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
  'kettlebell',
  'cardio',
  'other',
] as const
export const exerciseKindSchema = z.enum(EXERCISE_KINDS)
export type ExerciseKind = z.infer<typeof exerciseKindSchema>

export const EXERCISE_KIND_LABELS: Readonly<Record<ExerciseKind, string>> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  cable: 'Cable',
  bodyweight: 'Bodyweight',
  kettlebell: 'Kettlebell',
  cardio: 'Cardio',
  other: 'Other',
}

export const MUSCLE_GROUPS = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'core',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'full_body',
] as const
export const muscleGroupSchema = z.enum(MUSCLE_GROUPS)
export type MuscleGroup = z.infer<typeof muscleGroupSchema>

export const MUSCLE_GROUP_LABELS: Readonly<Record<MuscleGroup, string>> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  core: 'Core',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  full_body: 'Full body',
}

/**
 * What a set of this exercise records. Most lifts are weight and reps; a plank is time; a
 * run is time and distance; a pull-up is reps (weight optional, for a belt).
 */
export const EXERCISE_MEASURES = ['weight', 'reps', 'time', 'distance'] as const
export const exerciseMeasureSchema = z.enum(EXERCISE_MEASURES)
export type ExerciseMeasure = z.infer<typeof exerciseMeasureSchema>
