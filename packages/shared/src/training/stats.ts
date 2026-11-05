import type { BestBasis, ExerciseKind, ExerciseMeasure } from './enums.js'
import type { WorkoutInput, WorkoutSet } from './schemas.js'

/** The order a lift is compared in: weight for a lift, else reps, time, distance. */
export const MEASURE_ORDER: readonly ExerciseMeasure[] = ['weight', 'reps', 'time', 'distance']

/**
 * The first training maths (docs/TRAINING-MATHS.md): what a session adds up to. Pure and
 * deterministic, like the nutrition engine; the screens and the API both read these.
 */

/** A set counts when it was ticked done. */
export function isWorkingSet(set: WorkoutSet): boolean {
  return set.completed
}

/**
 * The sets of one exercise in one session, with the kilograms of the person's own body each
 * rep lifts (D44). Null or absent means none: a barbell lift, or a block not worked out yet.
 */
export interface LoadedSets {
  sets: readonly WorkoutSet[]
  bodyweightKg?: number | null
}

/**
 * The share of bodyweight an exercise lifts when nobody has said otherwise: all of it for a
 * bodyweight exercise that counts reps, none for anything else (a plank is timed, a squat's
 * volume is the bar). The catalogue sets its own shares; this is for a person's own exercises.
 */
export function defaultBodyweightShare(
  kind: ExerciseKind,
  measures: readonly ExerciseMeasure[],
): number {
  return kind === 'bodyweight' && measures.includes('reps') ? 1 : 0
}

/**
 * Kilograms of the person's own body one rep lifts: the exercise's share × their body weight,
 * to 0.1 kg. Null when the exercise lifts none of it or the weight is not known.
 */
export function bodyweightLoadKg(share: number, bodyWeightKg: number | null): number | null {
  if (!(share > 0) || bodyWeightKg === null || !(bodyWeightKg > 0)) return null
  // The hair added makes an exact half round up (0.35 × 85 is 29.749999… in floating point),
  // as the numeric rounding in migration 0019 does.
  return Math.round(share * bodyWeightKg * 10 + 1e-9) / 10
}

/**
 * Kilograms one rep of a set moves: the block's bodyweight load plus the weight on the set
 * (the bar, or a belt on a pull-up). Null when there is neither.
 */
export function setLoadKg(set: WorkoutSet, bodyweightKg?: number | null): number | null {
  const own = bodyweightKg ?? 0
  if (set.weightKg === null && own <= 0) return null
  return own + (set.weightKg ?? 0)
}

/**
 * Load × reps for one set, the load being bodyweight plus weight (`setLoadKg`); 0 when the
 * set has no load or no reps, or is not a working set.
 */
export function setVolumeKg(set: WorkoutSet, bodyweightKg?: number | null): number {
  if (!isWorkingSet(set)) return 0
  return (setLoadKg(set, bodyweightKg) ?? 0) * (set.reps ?? 0)
}

export function exerciseVolumeKg(block: LoadedSets): number {
  return block.sets.reduce((sum, set) => sum + setVolumeKg(set, block.bodyweightKg), 0)
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

/**
 * Whole seconds since the start: to the finish once there is one, else to `now` (epoch ms),
 * the running clock on an open session. Never negative, like the duration.
 */
export function workoutElapsedS(
  workout: Pick<WorkoutInput, 'startedAt' | 'endedAt'>,
  now: number,
): number {
  const end = workout.endedAt ? Date.parse(workout.endedAt) : now
  return Math.max(0, Math.floor((end - Date.parse(workout.startedAt)) / 1000))
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
 * the set (load × reps, the load including the block's bodyweight), null when it has no load
 * or no reps. `weight` stays the weight on the set alone. Working or not is not checked here.
 */
export function setMetricValue(
  set: WorkoutSet,
  metric: SetMetric,
  bodyweightKg?: number | null,
): number | null {
  if (metric !== 'volume') return setMeasureValue(set, metric)
  const load = setLoadKg(set, bodyweightKg)
  if (load === null || set.reps === null) return null
  return load * set.reps
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

/** The winner of a ranking: the set, its value on the metric, and its block's bodyweight load. */
export interface BestSet {
  set: WorkoutSet
  value: number
  bodyweightKg: number | null
}

/**
 * The best working set by a metric across blocks, each read with its own bodyweight load;
 * null when nothing was done or no set recorded it. Ties on kilograms lifted go to the
 * heavier set, then the one with more reps; ties on weight go to more reps; the earlier set
 * wins otherwise.
 */
export function bestSetAcross(blocks: readonly LoadedSets[], metric: SetMetric): BestSet | null {
  let best: BestSet | null = null
  for (const block of blocks) {
    const bodyweightKg = block.bodyweightKg ?? null
    for (const set of block.sets) {
      if (!isWorkingSet(set)) continue
      const value = setMetricValue(set, metric, bodyweightKg)
      if (value === null) continue
      if (
        best === null ||
        value > best.value ||
        (value === best.value && beatsOnTies(set, best.set, metric))
      ) {
        best = { set, value, bodyweightKg }
      }
    }
  }
  return best
}

/** The best working set of one block by a metric (`bestSetAcross` for its rules). */
export function bestSetBy(
  sets: readonly WorkoutSet[],
  metric: SetMetric,
  bodyweightKg?: number | null,
): WorkoutSet | null {
  return bestSetAcross([{ sets, bodyweightKg }], metric)?.set ?? null
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
 * candidate; an unticked set at that position never counts.
 */
export function bestSetAt(
  history: readonly LoadedSets[],
  index: number,
  metric: SetMetric,
): WorkoutSet | null {
  const candidates: LoadedSets[] = []
  for (const entry of history) {
    const set = entry.sets[index]
    if (set) candidates.push({ sets: [set], bodyweightKg: entry.bodyweightKg })
  }
  return bestSetAcross(candidates, metric)?.set ?? null
}

/** A set with any number in it; finishing a session drops the rest. */
export function isRecordedSet(set: WorkoutSet): boolean {
  return (
    set.weightKg !== null || set.reps !== null || set.durationS !== null || set.distanceM !== null
  )
}

/**
 * The session the "Last" column reads, from past sessions newest first: the latest where the
 * exercise was done (a set ticked), else the latest with any numbers (a plan copied forward
 * and never ticked). A session where it was skipped, with no sets or only blank ones, is
 * passed over; null when every one was.
 */
export function lastDoneSession<T extends { sets: readonly WorkoutSet[] }>(
  history: readonly T[],
): T | null {
  return (
    history.find((entry) => entry.sets.some(isWorkingSet)) ??
    history.find((entry) => entry.sets.some(isRecordedSet)) ??
    null
  )
}

export interface RepeatOptions {
  day: string
  startedAt: string
  newId: () => string
}

/**
 * Gives every block that has no bodyweight load yet one, from its exercise's share and the
 * person's body weight (`bodyweightLoadKg`). A block already worked out, to a number or to
 * null, is left alone, as is one whose exercise or the body weight is not known yet (it is
 * tried again next time). The phone runs this on a session it is logging so the tally is
 * right before the save lands; the server works out the stored figure itself.
 */
export function fillBodyweightLoads(
  input: WorkoutInput,
  shareOf: (exerciseId: string) => number | undefined,
  bodyWeightKg: number | null,
): WorkoutInput {
  if (input.exercises.every((block) => block.bodyweightKg !== undefined)) return input
  return {
    ...input,
    exercises: input.exercises.map((block) => {
      if (block.bodyweightKg !== undefined) return block
      if (block.exerciseId === null) return { ...block, bodyweightKg: null }
      const share = shareOf(block.exerciseId)
      if (share === undefined) return block
      if (!(share > 0)) return { ...block, bodyweightKg: null }
      if (bodyWeightKg === null) return block
      return { ...block, bodyweightKg: bodyweightLoadKg(share, bodyWeightKg) }
    }),
  }
}

/**
 * A new session from a past one: the same title, exercises and sets, with fresh ids,
 * nothing ticked done and no finish time. The person adjusts the numbers as they go. The
 * bodyweight loads are left out: they belong to the day they were worked out on.
 */
export function repeatWorkout(
  source: Pick<WorkoutInput, 'title' | 'exercises'>,
  options: RepeatOptions,
): WorkoutInput {
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
  if (last) return { ...last, id, completed: false }
  return {
    id,
    weightKg: null,
    reps: null,
    durationS: null,
    distanceM: null,
    rpe: null,
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
 * working sets only, volume from load × reps.
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
