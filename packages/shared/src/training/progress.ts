import { addDays, daysBetween, weekdayIndex } from '../dates.js'
import type { BestBasis, ExerciseMeasure, MuscleGroup } from './enums.js'
import { inferMeasure } from './insights.js'
import type { WorkoutInput, WorkoutSet } from './schemas.js'
import {
  bestSetAcross,
  isWorkingSet,
  liftMetric,
  primaryMeasure,
  setLoadKg,
  summariseWorkouts,
  type LoadedSets,
  type SetMetric,
  type WorkoutsSummary,
} from './stats.js'

/**
 * Gym progress (docs/TRAINING-MATHS.md, "Progress over a range"): what a range of finished
 * sessions adds up to against the range before it, week by week, how steady the training
 * has been, which muscles got the sets, estimated one-rep maxes and records. Pure and
 * deterministic; the gym Progress screen renders it. Only finished sessions count, as in
 * `summariseWorkouts`.
 */

export type ProgressWorkout = Pick<
  WorkoutInput,
  'day' | 'exercises' | 'startedAt' | 'endedAt' | 'feel'
> & { id: string }

/** A run of user-local days, both ends included. */
export interface DayWindow {
  from: string
  to: string
}

/** The `days` days ending on `to`, `to` included. */
export function windowEnding(to: string, days: number): DayWindow {
  return { from: addDays(to, -(Math.max(1, days) - 1)), to }
}

/** The window of the same length that ends the day before `window` starts. */
export function previousWindow(window: DayWindow): DayWindow {
  const length = windowLength(window)
  return { from: addDays(window.from, -length), to: addDays(window.from, -1) }
}

export function windowLength(window: DayWindow): number {
  return daysBetween(window.from, window.to) + 1
}

function inWindow(day: string, window: DayWindow): boolean {
  return day >= window.from && day <= window.to
}

/** Finished sessions in the window, oldest first (by day, then start). */
export function finishedIn<T extends ProgressWorkout>(
  workouts: readonly T[],
  window: DayWindow,
): T[] {
  return workouts
    .filter((workout) => workout.endedAt !== null && inWindow(workout.day, window))
    .sort(byTime)
}

function byTime(a: ProgressWorkout, b: ProgressWorkout): number {
  return a.day === b.day ? a.startedAt.localeCompare(b.startedAt) : a.day.localeCompare(b.day)
}

function ratio(current: number, previous: number): number | null {
  return previous > 0 ? (current - previous) / previous : null
}

// --- Period summary -----------------------------------------------------------------------

export interface PeriodSummary extends WorkoutsSummary {
  /** Days in the window. */
  days: number
  /** Sessions per 7 days of the window. */
  sessionsPerWeek: number
  /** Minutes / sessions; null with no sessions. */
  avgSessionMin: number | null
  /** Working sets / sessions; null with no sessions. */
  avgSetsPerSession: number | null
  /** Mean of the 1-5 feel over the sessions that were asked; null when none were. */
  avgFeel: number | null
  /** Sessions that recorded a feel. */
  feltSessions: number
}

export function summarisePeriod(
  workouts: readonly ProgressWorkout[],
  window: DayWindow,
): PeriodSummary {
  const sessions = finishedIn(workouts, window)
  const totals = summariseWorkouts(sessions)
  const days = windowLength(window)
  const felt = sessions.flatMap((workout) => (workout.feel === null ? [] : [workout.feel]))
  return {
    ...totals,
    days,
    sessionsPerWeek: (totals.sessions * 7) / days,
    avgSessionMin: totals.sessions > 0 ? totals.minutes / totals.sessions : null,
    avgSetsPerSession: totals.sessions > 0 ? totals.workingSets / totals.sessions : null,
    avgFeel: felt.length > 0 ? felt.reduce((sum, feel) => sum + feel, 0) / felt.length : null,
    feltSessions: felt.length,
  }
}

export interface PeriodChange {
  sessions: number | null
  daysTrained: number | null
  workingSets: number | null
  volumeKg: number | null
  minutes: number | null
}

export interface PeriodComparison {
  window: DayWindow
  current: PeriodSummary
  /** Null when the data loaded does not reach back over the whole previous window. */
  previous: PeriodSummary | null
  /** `(current − previous) / previous` per total; null when previous is 0 or missing. */
  change: PeriodChange
}

/**
 * The window against the one before it. `dataFrom` is the first day the caller loaded: a
 * previous window that starts before it would be compared against days never read, so it is
 * left out rather than read as a quiet stretch.
 */
export function comparePeriods(
  workouts: readonly ProgressWorkout[],
  window: DayWindow,
  dataFrom: string,
): PeriodComparison {
  const current = summarisePeriod(workouts, window)
  const before = previousWindow(window)
  const previous = before.from >= dataFrom ? summarisePeriod(workouts, before) : null
  const change = (key: keyof PeriodChange): number | null =>
    previous ? ratio(current[key], previous[key]) : null
  return {
    window,
    current,
    previous,
    change: {
      sessions: change('sessions'),
      daysTrained: change('daysTrained'),
      workingSets: change('workingSets'),
      volumeKg: change('volumeKg'),
      minutes: change('minutes'),
    },
  }
}

// --- Week by week -------------------------------------------------------------------------

/** The Monday of the week a day falls in. */
export function weekStart(day: string): string {
  return addDays(day, -weekdayIndex(day))
}

export interface WeekTotals {
  /** The Monday the week starts on. */
  weekStart: string
  /** Days of this week inside the window: 7, or fewer for the first and last weeks. */
  days: number
  sessions: number
  workingSets: number
  volumeKg: number
  minutes: number
}

/**
 * Monday-to-Sunday weeks across the window, empty weeks included, oldest first. Only days
 * inside the window count, so the first and last weeks can be part weeks (`days` says how
 * much of each is in).
 */
export function weeklyTotals(
  workouts: readonly ProgressWorkout[],
  window: DayWindow,
): WeekTotals[] {
  const weeks: WeekTotals[] = []
  for (let monday = weekStart(window.from); monday <= window.to; monday = addDays(monday, 7)) {
    const from = monday < window.from ? window.from : monday
    const sunday = addDays(monday, 6)
    const to = sunday > window.to ? window.to : sunday
    const totals = summariseWorkouts(finishedIn(workouts, { from, to }))
    weeks.push({
      weekStart: monday,
      days: daysBetween(from, to) + 1,
      sessions: totals.sessions,
      workingSets: totals.workingSets,
      volumeKg: totals.volumeKg,
      minutes: totals.minutes,
    })
  }
  return weeks
}

// --- Consistency --------------------------------------------------------------------------

export interface WeekStreaks {
  /**
   * Weeks in a row with at least one finished session, up to this week. A week with none
   * yet does not break the run until it is over: the count then starts from last week.
   */
  current: number
  /** The longest such run in the data. */
  longest: number
  /** Whether this week already has a session. */
  thisWeek: boolean
}

export function weekStreaks(workouts: readonly ProgressWorkout[], today: string): WeekStreaks {
  const trained = new Set(
    workouts
      .filter((workout) => workout.endedAt !== null && workout.day <= today)
      .map((workout) => weekStart(workout.day)),
  )
  const thisMonday = weekStart(today)
  const thisWeek = trained.has(thisMonday)
  let current = 0
  for (
    let monday = thisWeek ? thisMonday : addDays(thisMonday, -7);
    trained.has(monday);
    monday = addDays(monday, -7)
  ) {
    current += 1
  }
  let longest = 0
  for (const monday of trained) {
    if (trained.has(addDays(monday, -7))) continue
    let run = 0
    for (let week = monday; trained.has(week); week = addDays(week, 7)) run += 1
    longest = Math.max(longest, run)
  }
  return { current, longest, thisWeek }
}

export interface CalendarDay {
  day: string
  sessions: number
  workingSets: number
  /** 0 for no session, else 1 to 4 by working sets against the busiest day in the window. */
  level: 0 | 1 | 2 | 3 | 4
  /** False for the padding days that square the grid off before and after the window. */
  inWindow: boolean
}

/**
 * The window as a calendar: one column per Monday-to-Sunday week, oldest first, seven days
 * each. A day with a finished session is level 1 to 4, `ceil(4 × sets / most sets on any
 * day)`, so the busiest day is 4 and a session with nothing ticked is still 1.
 */
export function trainingCalendar(
  workouts: readonly ProgressWorkout[],
  window: DayWindow,
): CalendarDay[][] {
  const byDay = new Map<string, { sessions: number; workingSets: number }>()
  for (const workout of finishedIn(workouts, window)) {
    const entry = byDay.get(workout.day) ?? { sessions: 0, workingSets: 0 }
    entry.sessions += 1
    entry.workingSets += summariseWorkouts([workout]).workingSets
    byDay.set(workout.day, entry)
  }
  const most = Math.max(0, ...[...byDay.values()].map((entry) => entry.workingSets))
  const columns: CalendarDay[][] = []
  for (let monday = weekStart(window.from); monday <= window.to; monday = addDays(monday, 7)) {
    columns.push(
      Array.from({ length: 7 }, (_, i) => {
        const day = addDays(monday, i)
        const entry = inWindow(day, window) ? byDay.get(day) : undefined
        const sessions = entry?.sessions ?? 0
        const workingSets = entry?.workingSets ?? 0
        return {
          day,
          sessions,
          workingSets,
          level: sessions === 0 ? 0 : most === 0 ? 1 : levelOf(workingSets, most),
          inWindow: inWindow(day, window),
        }
      }),
    )
  }
  return columns
}

function levelOf(sets: number, most: number): 1 | 2 | 3 | 4 {
  const level = Math.ceil((4 * sets) / most)
  return level <= 1 ? 1 : level === 2 ? 2 : level === 3 ? 3 : 4
}

/** Finished sessions in the window by weekday, Monday first. */
export function sessionsByWeekday(
  workouts: readonly ProgressWorkout[],
  window: DayWindow,
): number[] {
  const counts = [0, 0, 0, 0, 0, 0, 0]
  for (const workout of finishedIn(workouts, window)) {
    const i = weekdayIndex(workout.day)
    counts[i] = (counts[i] ?? 0) + 1
  }
  return counts
}

// --- Muscle groups ------------------------------------------------------------------------

export interface MuscleGroupShare {
  /** `unassigned`: blocks whose exercise is not known or lists no muscle group. */
  group: MuscleGroup | 'unassigned'
  /** Working sets that worked the group. */
  sets: number
  /** `sets` per 7 days of the window. */
  perWeek: number
}

/**
 * Working sets per muscle group, most first. A set counts once for every group its exercise
 * lists (a bench press set is a chest set and a triceps set), so the groups add up to more
 * than the sets done. Blocks with no known groups are counted as `unassigned` so nothing done
 * goes missing; groups with no sets are left out.
 */
export function muscleGroupSets(
  workouts: readonly ProgressWorkout[],
  window: DayWindow,
  groupsOf: (exerciseId: string | null) => readonly MuscleGroup[] | undefined,
): MuscleGroupShare[] {
  const sets = new Map<MuscleGroup | 'unassigned', number>()
  for (const workout of finishedIn(workouts, window)) {
    for (const block of workout.exercises) {
      const done = block.sets.filter(isWorkingSet).length
      if (done === 0) continue
      const groups = groupsOf(block.exerciseId) ?? []
      for (const group of groups.length > 0 ? groups : (['unassigned'] as const)) {
        sets.set(group, (sets.get(group) ?? 0) + done)
      }
    }
  }
  const days = windowLength(window)
  return [...sets.entries()]
    .map(([group, count]) => ({ group, sets: count, perWeek: (count * 7) / days }))
    .sort((a, b) => b.sets - a.sets || a.group.localeCompare(b.group))
}

// --- Strength -----------------------------------------------------------------------------

/** Above this many reps a one-rep max estimate says more about endurance than strength. */
export const E1RM_MAX_REPS = 12

/**
 * Estimated one-rep max by Epley: load × (1 + reps / 30), to 0.1 kg. One rep is the load
 * itself. Null without a load, with no reps, or past `E1RM_MAX_REPS`.
 */
export function estimatedOneRepMaxKg(loadKg: number | null, reps: number | null): number | null {
  if (loadKg === null || !(loadKg > 0) || reps === null || reps < 1 || reps > E1RM_MAX_REPS) {
    return null
  }
  const estimate = reps === 1 ? loadKg : loadKg * (1 + reps / 30)
  return Math.round(estimate * 10) / 10
}

/** The best estimate over the working sets of these blocks, each with its bodyweight load. */
export function bestOneRepMaxKg(blocks: readonly LoadedSets[]): {
  e1rmKg: number
  set: WorkoutSet
  bodyweightKg: number | null
} | null {
  let best: { e1rmKg: number; set: WorkoutSet; bodyweightKg: number | null } | null = null
  for (const block of blocks) {
    const bodyweightKg = block.bodyweightKg ?? null
    for (const set of block.sets) {
      if (!isWorkingSet(set)) continue
      const e1rmKg = estimatedOneRepMaxKg(setLoadKg(set, bodyweightKg), set.reps)
      if (e1rmKg !== null && (best === null || e1rmKg > best.e1rmKg)) {
        best = { e1rmKg, set, bodyweightKg }
      }
    }
  }
  return best
}

export interface StrengthPoint {
  workoutId: string
  day: string
  e1rmKg: number
  /** The set the estimate came from. */
  set: WorkoutSet
  bodyweightKg: number | null
}

export interface LiftStrength {
  exerciseId: string | null
  exerciseName: string
  /** Finished sessions in the window with a working set of this exercise. */
  sessions: number
  /** One per session that had a set to estimate from, oldest first. */
  points: StrengthPoint[]
  first: StrengthPoint
  latest: StrengthPoint
  best: StrengthPoint
  /** `latest − first`, kg. */
  changeKg: number
  /** `changeKg / first`; null with one point. */
  changePct: number | null
}

function liftKey(exerciseId: string | null, exerciseName: string): string {
  return exerciseId ?? `name:${exerciseName.trim().toLowerCase()}`
}

/**
 * Estimated one-rep max per session for every exercise with a loaded set of 1 to 12 reps in
 * the window (bodyweight loads count, D44), most sessions first, then the name. First against
 * latest is the change; a lift done once has none.
 */
export function strengthTrends(
  workouts: readonly ProgressWorkout[],
  window: DayWindow,
): LiftStrength[] {
  const lifts = new Map<
    string,
    { exerciseId: string | null; exerciseName: string; sessions: number; points: StrengthPoint[] }
  >()
  for (const workout of finishedIn(workouts, window)) {
    const blocksByLift = new Map<string, LoadedSets[]>()
    const names = new Map<string, { exerciseId: string | null; exerciseName: string }>()
    for (const block of workout.exercises) {
      if (!block.sets.some(isWorkingSet)) continue
      const key = liftKey(block.exerciseId, block.exerciseName)
      blocksByLift.set(key, [...(blocksByLift.get(key) ?? []), block])
      if (!names.has(key)) names.set(key, block)
    }
    for (const [key, blocks] of blocksByLift) {
      const name = names.get(key)
      if (!name) continue
      const entry = lifts.get(key) ?? {
        exerciseId: name.exerciseId,
        exerciseName: name.exerciseName,
        sessions: 0,
        points: [],
      }
      entry.sessions += 1
      const best = bestOneRepMaxKg(blocks)
      if (best) entry.points.push({ workoutId: workout.id, day: workout.day, ...best })
      lifts.set(key, entry)
    }
  }
  const out: LiftStrength[] = []
  for (const entry of lifts.values()) {
    const first = entry.points[0]
    const latest = entry.points[entry.points.length - 1]
    if (!first || !latest) continue
    const best = entry.points.reduce((top, point) => (point.e1rmKg > top.e1rmKg ? point : top))
    const changeKg = Math.round((latest.e1rmKg - first.e1rmKg) * 10) / 10
    out.push({
      ...entry,
      first,
      latest,
      best,
      changeKg,
      changePct: entry.points.length > 1 ? ratio(latest.e1rmKg, first.e1rmKg) : null,
    })
  }
  return out.sort((a, b) => b.sessions - a.sessions || a.exerciseName.localeCompare(b.exerciseName))
}

/** Lifts estimated in at least two sessions, biggest relative gain first; drops at the end. */
export function mostImproved(lifts: readonly LiftStrength[]): LiftStrength[] {
  return lifts
    .filter((lift) => lift.changePct !== null)
    .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0) || b.changeKg - a.changeKg)
}

// --- Records ------------------------------------------------------------------------------

export interface PersonalRecord {
  workoutId: string
  day: string
  exerciseId: string | null
  exerciseName: string
  /** What the exercise is ranked on (D39), as on its lift page. */
  metric: SetMetric
  value: number
  /** The best before this session, in the same metric. */
  previous: number
  set: WorkoutSet
  bodyweightKg: number | null
}

export interface RecordOptions {
  /** The exercise's declared measures; return undefined to infer from what its sets recorded. */
  measuresOf?: (exerciseId: string | null) => readonly ExerciseMeasure[] | undefined
  basis?: BestBasis
}

/**
 * Sessions in the window where an exercise's best working set beat every earlier finished
 * session in the data given, newest first. The first time an exercise appears is not a record:
 * there was nothing to beat. Ties are not records. Each exercise is ranked as its lift page
 * ranks it: kg lifted in one set or the heaviest weight (D39), else reps, time or distance.
 */
export function personalRecords(
  workouts: readonly ProgressWorkout[],
  window: DayWindow,
  options: RecordOptions = {},
): PersonalRecord[] {
  const basis = options.basis ?? 'volume'
  const finished = workouts.filter(
    (workout) => workout.endedAt !== null && workout.day <= window.to,
  )
  const sorted = [...finished].sort(byTime)

  // Every session's blocks per exercise, oldest first, to settle each exercise's metric once.
  const history = new Map<
    string,
    {
      exerciseId: string | null
      exerciseName: string
      sessions: { workout: ProgressWorkout; blocks: LoadedSets[] }[]
    }
  >()
  for (const workout of sorted) {
    const blocksByLift = new Map<string, LoadedSets[]>()
    for (const block of workout.exercises) {
      if (!block.sets.some(isWorkingSet)) continue
      const key = liftKey(block.exerciseId, block.exerciseName)
      blocksByLift.set(key, [...(blocksByLift.get(key) ?? []), block])
      if (!history.has(key)) {
        history.set(key, {
          exerciseId: block.exerciseId,
          exerciseName: block.exerciseName,
          sessions: [],
        })
      }
    }
    for (const [key, blocks] of blocksByLift) history.get(key)?.sessions.push({ workout, blocks })
  }

  const records: PersonalRecord[] = []
  for (const lift of history.values()) {
    const allBlocks = lift.sessions.flatMap((session) => session.blocks)
    const declared = options.measuresOf?.(lift.exerciseId)
    const measure =
      (declared && declared.length > 0 ? primaryMeasure(declared) : null) ?? inferMeasure(allBlocks)
    if (!measure) continue
    const recordsReps = declared
      ? declared.includes('reps')
      : allBlocks.some((block) => block.sets.some((set) => set.reps !== null))
    const metric = liftMetric(measure, basis, recordsReps)
    let best: number | null = null
    for (const session of lift.sessions) {
      const top = bestSetAcross(session.blocks, metric)
      if (!top) continue
      if (best !== null && top.value > best && inWindow(session.workout.day, window)) {
        records.push({
          workoutId: session.workout.id,
          day: session.workout.day,
          exerciseId: lift.exerciseId,
          exerciseName: lift.exerciseName,
          metric,
          value: top.value,
          previous: best,
          set: top.set,
          bodyweightKg: top.bodyweightKg,
        })
      }
      if (best === null || top.value > best) best = top.value
    }
  }
  return records.sort(
    (a, b) => b.day.localeCompare(a.day) || a.exerciseName.localeCompare(b.exerciseName),
  )
}
