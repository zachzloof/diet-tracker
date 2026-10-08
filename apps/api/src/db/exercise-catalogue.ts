import type { ExerciseKind, ExerciseMeasure, MuscleGroup } from '@diet-tracker/shared'

/**
 * The shared exercise catalogue (D35). The ids are fixed so every database has the same rows:
 * migration 0010 inserts them, and this list is what tests and the seed check against.
 * Adding a lift is a new migration that inserts it; never renumber or reuse an id.
 */
export interface CatalogueExercise {
  id: string
  name: string
  kind: ExerciseKind
  muscleGroups: MuscleGroup[]
  measures: ExerciseMeasure[]
}

const WR: ExerciseMeasure[] = ['weight', 'reps']
const R: ExerciseMeasure[] = ['reps']
const T: ExerciseMeasure[] = ['time']
const TD: ExerciseMeasure[] = ['time', 'distance']

let n = 0
/** Sequential ids under one fixed prefix, version 7 layout so they sort with real UUID v7s. */
const id = () => `0199c0a1-5e00-7000-8000-${String(++n).padStart(12, '0')}`

const entry = (
  name: string,
  kind: ExerciseKind,
  muscleGroups: MuscleGroup[],
  measures: ExerciseMeasure[] = WR,
): CatalogueExercise => ({ id: id(), name, kind, muscleGroups, measures })

export const EXERCISE_CATALOGUE: readonly CatalogueExercise[] = [
  // Squat and hinge
  entry('Barbell back squat', 'barbell', ['quads', 'glutes']),
  entry('Barbell front squat', 'barbell', ['quads', 'core']),
  entry('Goblet squat', 'dumbbell', ['quads', 'glutes']),
  entry('Leg press', 'machine', ['quads', 'glutes']),
  entry('Hack squat', 'machine', ['quads']),
  entry('Bulgarian split squat', 'dumbbell', ['quads', 'glutes']),
  entry('Walking lunge', 'dumbbell', ['quads', 'glutes']),
  entry('Conventional deadlift', 'barbell', ['hamstrings', 'glutes', 'back']),
  entry('Sumo deadlift', 'barbell', ['glutes', 'hamstrings', 'quads']),
  entry('Romanian deadlift', 'barbell', ['hamstrings', 'glutes']),
  entry('Dumbbell Romanian deadlift', 'dumbbell', ['hamstrings', 'glutes']),
  entry('Trap bar deadlift', 'barbell', ['quads', 'glutes', 'back']),
  entry('Hip thrust', 'barbell', ['glutes', 'hamstrings']),
  entry('Leg extension', 'machine', ['quads']),
  entry('Lying leg curl', 'machine', ['hamstrings']),
  entry('Seated leg curl', 'machine', ['hamstrings']),
  entry('Standing calf raise', 'machine', ['calves']),
  entry('Seated calf raise', 'machine', ['calves']),
  entry('Kettlebell swing', 'kettlebell', ['glutes', 'hamstrings', 'back']),

  // Push
  entry('Barbell bench press', 'barbell', ['chest', 'triceps', 'shoulders']),
  entry('Incline barbell bench press', 'barbell', ['chest', 'shoulders']),
  entry('Dumbbell bench press', 'dumbbell', ['chest', 'triceps']),
  entry('Incline dumbbell bench press', 'dumbbell', ['chest', 'shoulders']),
  entry('Machine chest press', 'machine', ['chest', 'triceps']),
  entry('Push-up', 'bodyweight', ['chest', 'triceps'], R),
  entry('Dip', 'bodyweight', ['chest', 'triceps']),
  entry('Cable fly', 'cable', ['chest']),
  entry('Pec deck', 'machine', ['chest']),
  entry('Overhead press', 'barbell', ['shoulders', 'triceps']),
  entry('Seated dumbbell shoulder press', 'dumbbell', ['shoulders', 'triceps']),
  entry('Machine shoulder press', 'machine', ['shoulders']),
  entry('Dumbbell lateral raise', 'dumbbell', ['shoulders']),
  entry('Cable lateral raise', 'cable', ['shoulders']),
  entry('Rear delt fly', 'dumbbell', ['shoulders', 'back']),
  entry('Face pull', 'cable', ['shoulders', 'back']),
  entry('Close-grip bench press', 'barbell', ['triceps', 'chest']),
  entry('Triceps pushdown', 'cable', ['triceps']),
  entry('Overhead triceps extension', 'cable', ['triceps']),
  entry('Skull crusher', 'barbell', ['triceps']),

  // Pull
  entry('Pull-up', 'bodyweight', ['back', 'biceps']),
  entry('Chin-up', 'bodyweight', ['back', 'biceps']),
  entry('Lat pulldown', 'cable', ['back', 'biceps']),
  entry('Barbell row', 'barbell', ['back', 'biceps']),
  entry('Pendlay row', 'barbell', ['back']),
  entry('Dumbbell row', 'dumbbell', ['back', 'biceps']),
  entry('Seated cable row', 'cable', ['back', 'biceps']),
  entry('Chest-supported row', 'machine', ['back']),
  entry('T-bar row', 'machine', ['back']),
  entry('Straight-arm pulldown', 'cable', ['back']),
  entry('Barbell shrug', 'barbell', ['back']),
  entry('Barbell curl', 'barbell', ['biceps']),
  entry('Dumbbell curl', 'dumbbell', ['biceps']),
  entry('Hammer curl', 'dumbbell', ['biceps', 'forearms']),
  entry('Incline dumbbell curl', 'dumbbell', ['biceps']),
  entry('Cable curl', 'cable', ['biceps']),
  entry('Preacher curl', 'machine', ['biceps']),
  entry('Wrist curl', 'dumbbell', ['forearms']),

  // Olympic and full body
  entry('Power clean', 'barbell', ['full_body']),
  entry('Clean and jerk', 'barbell', ['full_body']),
  entry('Snatch', 'barbell', ['full_body']),
  entry('Thruster', 'barbell', ['full_body']),
  entry('Farmer carry', 'dumbbell', ['full_body', 'forearms'], ['weight', 'distance']),

  // Core
  entry('Plank', 'bodyweight', ['core'], T),
  entry('Hanging leg raise', 'bodyweight', ['core'], R),
  entry('Cable crunch', 'cable', ['core']),
  entry('Ab wheel rollout', 'bodyweight', ['core'], R),
  entry('Russian twist', 'bodyweight', ['core'], R),
  entry('Back extension', 'bodyweight', ['back', 'glutes', 'hamstrings']),

  // Cardio
  entry('Run', 'cardio', ['full_body'], TD),
  entry('Walk', 'cardio', ['full_body'], TD),
  entry('Rowing machine', 'cardio', ['full_body'], TD),
  entry('Stationary bike', 'cardio', ['quads'], TD),
  entry('Stair climber', 'cardio', ['glutes', 'quads'], T),
  entry('Skipping', 'cardio', ['calves'], T),
]
