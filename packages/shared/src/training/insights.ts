import type { ExerciseMeasure } from './enums.js'
import type { WorkoutInput, WorkoutSet } from './schemas.js'
import { bestSet, isWorkingSet, summariseWorkouts, type WorkoutsSummary } from './stats.js'

/**
 * Week on week (docs/TRAINING-MATHS.md): what moved between this week's sessions and the
 * previous week's. Pure and deterministic; the gym Week screen renders it as insights and
 * the AI (slice 10) is handed these numbers, never asked to compute them.
 */

type WeekWorkout = Pick<WorkoutInput, 'day' | 'exercises' | 'startedAt' | 'endedAt'>

/** The measure an exercise is compared on: weight for a lift, else reps, time, distance. */
export const MEASURE_ORDER: readonly ExerciseMeasure[] = ['weight', 'reps', 'time', 'distance']

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
 * Infers the measure to compare a block on from what its sets recorded, in `MEASURE_ORDER`.
 * The screens pass the exercise's declared measures instead when the exercise is known.
 */
export function inferMeasure(
  blocks: readonly { sets: readonly WorkoutSet[] }[],
): ExerciseMeasure | null {
  for (const measure of MEASURE_ORDER) {
    if (blocks.some((block) => block.sets.some((set) => setMeasureValue(set, measure) !== null))) {
      return measure
    }
  }
  return null
}

export interface LiftWeek {
  /** The best working set of the week on the measure. */
  best: WorkoutSet
  value: number
  /** Working sets across the week's sessions. */
  sets: number
  /** Weight × reps across the week's working sets. */
  volumeKg: number
  sessions: number
}

export interface LiftChange {
  /** Null for a deleted custom exercise; then `exerciseName` is the key. */
  exerciseId: string | null
  exerciseName: string
  measure: ExerciseMeasure
  current: LiftWeek
  previous: LiftWeek
  /** `current.value − previous.value` in the measure's unit. */
  delta: number
  /** `delta / previous.value`; null when the previous best was 0. */
  deltaPct: number | null
}

export interface LiftOnlyThisWeek {
  exerciseId: string | null
  exerciseName: string
  measure: ExerciseMeasure
  current: LiftWeek
}

export interface LiftOnlyLastWeek {
  exerciseId: string | null
  exerciseName: string
  measure: ExerciseMeasure
  previous: LiftWeek
}

export interface WeekComparison {
  current: WorkoutsSummary
  previous: WorkoutsSummary
  /** `(current − previous) / previous` for volume; null when last week lifted nothing. */
  volumeChangePct: number | null
  /** Exercises done in both weeks, biggest relative gain first; drops at the end. */
  lifts: LiftChange[]
  /** Exercises done this week but not last week, most volume first. */
  onlyThisWeek: LiftOnlyThisWeek[]
  /** Exercises done last week but not this week, most volume first. */
  onlyLastWeek: LiftOnlyLastWeek[]
}

export interface CompareWeeksOptions {
  /**
   * The measure to compare an exercise on; return null to fall back to what its sets
   * recorded. The screens answer from the exercise catalogue's declared measures.
   */
  measureOf?: (exerciseId: string | null, exerciseName: string) => ExerciseMeasure | null
}

interface Bucket {
  exerciseId: string | null
  exerciseName: string
  blocks: { sets: readonly WorkoutSet[] }[]
  sessions: Set<number>
}

function liftKey(exerciseId: string | null, exerciseName: string): string {
  return exerciseId ?? `name:${exerciseName.trim().toLowerCase()}`
}

/** Finished sessions only, bucketed by exercise, with the index of each session it was in. */
function bucket(workouts: readonly WeekWorkout[]): Map<string, Bucket> {
  const out = new Map<string, Bucket>()
  workouts.forEach((workout, index) => {
    if (!workout.endedAt) return
    for (const block of workout.exercises) {
      if (!block.sets.some(isWorkingSet)) continue
      const key = liftKey(block.exerciseId, block.exerciseName)
      const entry = out.get(key) ?? {
        exerciseId: block.exerciseId,
        exerciseName: block.exerciseName,
        blocks: [],
        sessions: new Set<number>(),
      }
      entry.blocks.push(block)
      entry.sessions.add(index)
      out.set(key, entry)
    }
  })
  return out
}

function liftWeek(entry: Bucket, measure: ExerciseMeasure): LiftWeek | null {
  let best: WorkoutSet | null = null
  let sets = 0
  let volumeKg = 0
  for (const block of entry.blocks) {
    const candidate = bestSet(block.sets, measure)
    if (candidate) {
      const value = setMeasureValue(candidate, measure) ?? 0
      const bestValue = best ? (setMeasureValue(best, measure) ?? 0) : -1
      if (value > bestValue) best = candidate
    }
    for (const set of block.sets) {
      if (!isWorkingSet(set)) continue
      sets += 1
      volumeKg += (set.weightKg ?? 0) * (set.reps ?? 0)
    }
  }
  if (!best) return null
  return {
    best,
    value: setMeasureValue(best, measure) ?? 0,
    sets,
    volumeKg,
    sessions: entry.sessions.size,
  }
}

function pct(current: number, previous: number): number | null {
  return previous > 0 ? (current - previous) / previous : null
}

/**
 * This week's finished sessions against the previous week's. Totals follow `summariseWorkouts`.
 * Each exercise is compared on one measure (its declared first measure, else what its sets
 * recorded) by the best working set of each week: biggest relative gain first, ties by the
 * absolute gain, then drops. Exercises done in only one of the weeks are listed separately.
 */
export function compareWeeks(
  current: readonly WeekWorkout[],
  previous: readonly WeekWorkout[],
  options: CompareWeeksOptions = {},
): WeekComparison {
  const currentTotals = summariseWorkouts(current)
  const previousTotals = summariseWorkouts(previous)
  const now = bucket(current)
  const then = bucket(previous)

  const measureFor = (entry: Bucket, other?: Bucket): ExerciseMeasure | null =>
    options.measureOf?.(entry.exerciseId, entry.exerciseName) ??
    inferMeasure(other ? [...entry.blocks, ...other.blocks] : entry.blocks)

  const lifts: LiftChange[] = []
  const onlyThisWeek: LiftOnlyThisWeek[] = []
  const onlyLastWeek: LiftOnlyLastWeek[] = []

  for (const [key, entry] of now) {
    const before = then.get(key)
    const measure = measureFor(entry, before)
    if (!measure) continue
    const thisWeek = liftWeek(entry, measure)
    if (!thisWeek) continue
    const lastWeek = before ? liftWeek(before, measure) : null
    const id = { exerciseId: entry.exerciseId, exerciseName: entry.exerciseName, measure }
    if (lastWeek) {
      lifts.push({
        ...id,
        current: thisWeek,
        previous: lastWeek,
        delta: thisWeek.value - lastWeek.value,
        deltaPct: pct(thisWeek.value, lastWeek.value),
      })
    } else {
      onlyThisWeek.push({ ...id, current: thisWeek })
    }
  }
  for (const [key, entry] of then) {
    if (now.has(key)) continue
    const measure = measureFor(entry)
    if (!measure) continue
    const lastWeek = liftWeek(entry, measure)
    if (!lastWeek) continue
    onlyLastWeek.push({
      exerciseId: entry.exerciseId,
      exerciseName: entry.exerciseName,
      measure,
      previous: lastWeek,
    })
  }

  // A gain from a previous best of 0 has no percentage; it ranks above every measured gain.
  const rank = (lift: LiftChange): number =>
    lift.deltaPct ?? (lift.delta > 0 ? Number.MAX_SAFE_INTEGER : 0)
  lifts.sort(
    (a, b) =>
      rank(b) - rank(a) || b.delta - a.delta || a.exerciseName.localeCompare(b.exerciseName),
  )
  onlyThisWeek.sort(
    (a, b) =>
      b.current.volumeKg - a.current.volumeKg ||
      b.current.sets - a.current.sets ||
      a.exerciseName.localeCompare(b.exerciseName),
  )
  onlyLastWeek.sort(
    (a, b) =>
      b.previous.volumeKg - a.previous.volumeKg ||
      b.previous.sets - a.previous.sets ||
      a.exerciseName.localeCompare(b.exerciseName),
  )

  return {
    current: currentTotals,
    previous: previousTotals,
    volumeChangePct: pct(currentTotals.volumeKg, previousTotals.volumeKg),
    lifts,
    onlyThisWeek,
    onlyLastWeek,
  }
}

/** The one exercise in `lifts` whose best set rose, the biggest relative gain; null when none rose. */
export function biggestGain(comparison: Pick<WeekComparison, 'lifts'>): LiftChange | null {
  const first = comparison.lifts[0]
  return first && first.delta > 0 ? first : null
}

/** The one exercise in `lifts` whose best set fell the most; null when none fell. */
export function biggestDrop(comparison: Pick<WeekComparison, 'lifts'>): LiftChange | null {
  const last = comparison.lifts[comparison.lifts.length - 1]
  return last && last.delta < 0 ? last : null
}

/**
 * Tonnage for a tile: kilograms up to 999, tonnes from 1,000 kg (one decimal under 10 t,
 * whole tonnes from there). Returns the number and its unit separately so the tile can
 * style them; the web joins them for prose.
 */
export function tonnageParts(kg: number): { value: number; unit: 'kg' | 't'; decimals: 0 | 1 } {
  const rounded = Math.round(kg)
  if (rounded < 1000) return { value: rounded, unit: 'kg', decimals: 0 }
  const tonnes = rounded / 1000
  if (tonnes < 10) return { value: Math.round(tonnes * 10) / 10, unit: 't', decimals: 1 }
  return { value: Math.round(tonnes), unit: 't', decimals: 0 }
}
