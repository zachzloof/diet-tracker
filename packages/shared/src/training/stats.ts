import type { Workout, WorkoutExercise, WorkoutInput, WorkoutSet } from './schemas.js'

/**
 * The first training maths (docs/TRAINING-MATHS.md): what a session adds up to. Pure and
 * deterministic, like the nutrition engine; the screens and the API both read these.
 */

/** A set counts when it was done and was not a warm-up. */
export function isWorkingSet(set: WorkoutSet): boolean {
  return set.completed && !set.isWarmup
}

/** Weight × reps for one set; 0 when either is missing or it is not a working set. */
export function setVolumeKg(set: WorkoutSet): number {
  if (!isWorkingSet(set)) return 0
  return (set.weightKg ?? 0) * (set.reps ?? 0)
}

export function exerciseVolumeKg(block: Pick<WorkoutExercise, 'sets'>): number {
  return block.sets.reduce((sum, set) => sum + setVolumeKg(set), 0)
}

export function workoutVolumeKg(workout: Pick<WorkoutInput, 'exercises'>): number {
  return workout.exercises.reduce((sum, block) => sum + exerciseVolumeKg(block), 0)
}

export function workingSetCount(workout: Pick<WorkoutInput, 'exercises'>): number {
  return workout.exercises.reduce((sum, block) => sum + block.sets.filter(isWorkingSet).length, 0)
}

/**
 * Minutes from start to finish, rounded; null while the session is still open. A finish
 * before the start (a clock put right mid-session) reads as 0, never negative.
 */
export function workoutDurationMin(
  workout: Pick<WorkoutInput, 'startedAt' | 'endedAt'>,
): number | null {
  if (!workout.endedAt) return null
  const ms = Date.parse(workout.endedAt) - Date.parse(workout.startedAt)
  return Math.max(0, Math.round(ms / 60_000))
}

export interface WorkoutSummary {
  volumeKg: number
  workingSets: number
  /** Exercises with at least one working set. */
  exercisesDone: number
  durationMin: number | null
}

export function workoutSummary(
  workout: Pick<WorkoutInput, 'exercises' | 'startedAt' | 'endedAt'>,
): WorkoutSummary {
  return {
    volumeKg: workoutVolumeKg(workout),
    workingSets: workingSetCount(workout),
    exercisesDone: workout.exercises.filter((block) => block.sets.some(isWorkingSet)).length,
    durationMin: workoutDurationMin(workout),
  }
}

/** The best working set of a block by weight, then reps; null when nothing was done. */
export function topSet(sets: readonly WorkoutSet[]): WorkoutSet | null {
  let best: WorkoutSet | null = null
  for (const set of sets) {
    if (!isWorkingSet(set)) continue
    if (
      best === null ||
      (set.weightKg ?? 0) > (best.weightKg ?? 0) ||
      ((set.weightKg ?? 0) === (best.weightKg ?? 0) && (set.reps ?? 0) > (best.reps ?? 0))
    ) {
      best = set
    }
  }
  return best
}

export interface RepeatOptions {
  day: string
  startedAt: string
  newId: () => string
}

/**
 * A new session from a past one: the same title, exercises and sets, with fresh ids,
 * nothing ticked done and no finish time. The person adjusts the numbers as they go.
 */
export function repeatWorkout(source: Workout, options: RepeatOptions): WorkoutInput {
  return {
    day: options.day,
    startedAt: options.startedAt,
    endedAt: null,
    title: source.title,
    notes: '',
    feel: null,
    exercises: source.exercises.map((block) => ({
      id: options.newId(),
      exerciseId: block.exerciseId,
      exerciseName: block.exerciseName,
      notes: '',
      sets: block.sets.map((set) => ({ ...set, id: options.newId(), completed: false })),
    })),
  }
}

/** The empty session a person starts from. */
export function emptyWorkout(day: string, startedAt: string): WorkoutInput {
  return { day, startedAt, endedAt: null, title: '', notes: '', feel: null, exercises: [] }
}

/** A new set for a block: a copy of the last set (not done), else a blank one. */
export function nextSet(sets: readonly WorkoutSet[], id: string): WorkoutSet {
  const last = sets[sets.length - 1]
  if (last) return { ...last, id, completed: false, isWarmup: false }
  return {
    id,
    weightKg: null,
    reps: null,
    durationS: null,
    distanceM: null,
    rpe: null,
    isWarmup: false,
    completed: false,
  }
}
