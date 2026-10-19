import type { BestBasis, ExerciseMeasure } from './enums.js'
import type { Workout, WorkoutExercise, WorkoutInput, WorkoutSet } from './schemas.js'

/** The order a lift is compared in: weight for a lift, else reps, time, distance. */
export const MEASURE_ORDER: readonly ExerciseMeasure[] = ['weight', 'reps', 'time', 'distance']

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

/** The measures a block can be ranked on, plus the kilograms lifted in one set. */
export type SetMetric = ExerciseMeasure | 'volume'

/** The value of a set on one measure; null when the set did not record it. */
export function setMeasureValue(set: WorkoutSet, measure: ExerciseMeasure): number | null {
  switch (measure) {
    case 'weight':
      return set.weightKg
    case 'reps':
      return set.reps
    case 'time':
      return set.durationS
    case 'distance':
      return set.distanceM
  }
}

/**
 * The value of a set on a metric: a measure's value, or for `volume` the kilograms lifted in
 * the set (weight × reps), null when either is missing. Working or not is not checked here.
 */
export function setMetricValue(set: WorkoutSet, metric: SetMetric): number | null {
  if (metric !== 'volume') return setMeasureValue(set, metric)
  if (set.weightKg === null || set.reps === null) return null
  return set.weightKg * set.reps
}

/** The exercise's first measure in `MEASURE_ORDER` (weight, reps, time, distance); null with none. */
export function primaryMeasure(measures: readonly ExerciseMeasure[]): ExerciseMeasure | null {
  return MEASURE_ORDER.find((measure) => measures.includes(measure)) ?? null
}

/**
 * What a lift is ranked on (D39): kilograms lifted in one set when the exercise is compared
 * on weight, records reps and the basis is `volume`; otherwise the measure itself. So a
 * farmer carry (weight and distance) ranks by weight under either basis.
 */
export function liftMetric(
  measure: ExerciseMeasure,
  basis: BestBasis,
  recordsReps: boolean,
): SetMetric {
  return measure === 'weight' && basis === 'volume' && recordsReps ? 'volume' : measure
}

/** Ties on the metric break on these, in order; the earlier set wins a full tie. */
const TIE_BREAKS: Readonly<Record<SetMetric, readonly SetMetric[]>> = {
  volume: ['weight', 'reps'],
  weight: ['reps'],
  reps: [],
  time: [],
  distance: [],
}

/**
 * The best working set by a metric; null when nothing was done or no set recorded it. Ties
 * on kilograms lifted go to the heavier set, then the one with more reps; ties on weight go
 * to more reps; the earlier set wins otherwise.
 */
export function bestSetBy(sets: readonly WorkoutSet[], metric: SetMetric): WorkoutSet | null {
  let best: WorkoutSet | null = null
  let bestValue = 0
  for (const set of sets) {
    if (!isWorkingSet(set)) continue
    const value = setMetricValue(set, metric)
    if (value === null) continue
    if (
      best === null ||
      value > bestValue ||
      (value === bestValue && beatsOnTies(set, best, metric))
    ) {
      best = set
      bestValue = value
    }
  }
  return best
}

function beatsOnTies(candidate: WorkoutSet, holder: WorkoutSet, metric: SetMetric): boolean {
  for (const tie of TIE_BREAKS[metric]) {
    const a = setMetricValue(candidate, tie) ?? 0
    const b = setMetricValue(holder, tie) ?? 0
    if (a !== b) return a > b
  }
  return false
}

/** The heaviest working set of a block, reps breaking a tie; null when nothing was done. */
export function topSet(sets: readonly WorkoutSet[]): WorkoutSet | null {
  return bestSetBy(sets, 'weight')
}

/**
 * The best working set of a block for one measure: heaviest for weight (reps break a tie,
 * as `topSet`), most reps, longest time or furthest distance. Null when nothing was done
 * or no set recorded that measure.
 */
export function bestSet(sets: readonly WorkoutSet[], measure: ExerciseMeasure): WorkoutSet | null {
  return bestSetBy(sets, measure)
}

/**
 * The best working set at one position across past sessions, by a metric: the "Best" column
 * of the session screen reads set 3's best against set 3. A session with fewer sets has no
 * candidate; a warm-up or an unticked set at that position never counts.
 */
export function bestSetAt(
  history: readonly { sets: readonly WorkoutSet[] }[],
  index: number,
  metric: SetMetric,
): WorkoutSet | null {
  const candidates: WorkoutSet[] = []
  for (const entry of history) {
    const set = entry.sets[index]
    if (set) candidates.push(set)
  }
  return bestSetBy(candidates, metric)
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

export interface WorkoutsSummary {
  /** Finished sessions. */
  sessions: number
  /** Distinct user-local days with at least one finished session. */
  daysTrained: number
  workingSets: number
  volumeKg: number
  /** Minutes across finished sessions. */
  minutes: number
}

/**
 * What a range of sessions adds up to (the gym Week tiles). Only finished sessions count;
 * one still open has no duration and may yet change. Each session's own rules apply:
 * working sets only, volume from weight × reps.
 */
export function summariseWorkouts(
  workouts: readonly Pick<WorkoutInput, 'day' | 'exercises' | 'startedAt' | 'endedAt'>[],
): WorkoutsSummary {
  const days = new Set<string>()
  let sessions = 0
  let workingSets = 0
  let volumeKg = 0
  let minutes = 0
  for (const workout of workouts) {
    if (!workout.endedAt) continue
    const summary = workoutSummary(workout)
    sessions += 1
    days.add(workout.day)
    workingSets += summary.workingSets
    volumeKg += summary.volumeKg
    minutes += summary.durationMin ?? 0
  }
  return { sessions, daysTrained: days.size, workingSets, volumeKg, minutes }
}
