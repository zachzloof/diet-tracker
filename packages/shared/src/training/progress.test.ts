import { describe, expect, it } from 'vitest'
import type { MuscleGroup } from './enums.js'
import {
  comparePeriods,
  estimatedOneRepMaxKg,
  mostImproved,
  muscleGroupSets,
  personalRecords,
  previousWindow,
  sessionsByWeekday,
  strengthTrends,
  summarisePeriod,
  trainingCalendar,
  weekStart,
  weekStreaks,
  weeklyTotals,
  windowEnding,
  type ProgressWorkout,
} from './progress.js'
import type { WorkoutExerciseInput, WorkoutSet } from './schemas.js'

let n = 0
const id = () => `0199c000-0000-7000-8000-${String(++n).padStart(12, '0')}`

function set(weightKg: number | null, reps: number | null, completed = true): WorkoutSet {
  return { id: id(), weightKg, reps, durationS: null, distanceM: null, rpe: null, completed }
}

const SQUAT = id()
const BENCH = id()
const PULLUP = id()

function block(
  exerciseId: string | null,
  exerciseName: string,
  sets: WorkoutSet[],
  bodyweightKg: number | null = null,
): WorkoutExerciseInput {
  return { id: id(), exerciseId, exerciseName, notes: '', bodyweightKg, sets }
}

/** A finished 60-minute session on `day` at 18:00 UTC. */
function session(
  day: string,
  exercises: WorkoutExerciseInput[],
  extra: { feel?: number | null; open?: boolean; minutes?: number } = {},
): ProgressWorkout {
  const startedAt = `${day}T18:00:00.000Z`
  const end = new Date(Date.parse(startedAt) + (extra.minutes ?? 60) * 60_000).toISOString()
  return {
    id: id(),
    day,
    startedAt,
    endedAt: extra.open ? null : end,
    feel: extra.feel ?? null,
    exercises,
  }
}

// 2026-11-16 is a Monday; 2026-11-22 the Sunday after.
const TODAY = '2026-11-18'

describe('windows', () => {
  it('runs a window of n days back to front and the one before it', () => {
    const window = windowEnding(TODAY, 28)
    expect(window).toEqual({ from: '2026-10-22', to: TODAY })
    expect(previousWindow(window)).toEqual({ from: '2026-09-24', to: '2026-10-21' })
    expect(weekStart('2026-11-22')).toBe('2026-11-16')
    expect(weekStart('2026-11-16')).toBe('2026-11-16')
  })
})

describe('summarisePeriod and comparePeriods', () => {
  const workouts = [
    // Previous 7 days (Nov 5 to Nov 11): one session, 2 sets of 100 × 5 = 1,000 kg.
    session('2026-11-08', [block(SQUAT, 'Squat', [set(100, 5), set(100, 5)])], { feel: 3 }),
    // This window (Nov 12 to Nov 18): two sessions, one 90 minutes.
    session('2026-11-12', [block(SQUAT, 'Squat', [set(100, 5), set(110, 5), set(120, 1, false)])], {
      feel: 4,
    }),
    session('2026-11-17', [block(BENCH, 'Bench', [set(60, 8), set(60, 8)])], {
      feel: 5,
      minutes: 90,
    }),
    // Still open: never counts.
    session('2026-11-18', [block(BENCH, 'Bench', [set(80, 5)])], { open: true }),
  ]

  it('adds up finished sessions with averages per session and per week', () => {
    const summary = summarisePeriod(workouts, windowEnding(TODAY, 7))
    // 100×5 + 110×5 + 60×8 + 60×8 = 500 + 550 + 480 + 480.
    expect(summary).toMatchObject({
      sessions: 2,
      daysTrained: 2,
      workingSets: 4,
      volumeKg: 2010,
      minutes: 150,
      days: 7,
      sessionsPerWeek: 2,
      avgSessionMin: 75,
      avgSetsPerSession: 2,
      avgFeel: 4.5,
      feltSessions: 2,
    })
  })

  it('compares with the window before, and refuses one that reaches past the data', () => {
    const window = windowEnding(TODAY, 7)
    const comparison = comparePeriods(workouts, window, '2026-11-01')
    expect(comparison.previous?.sessions).toBe(1)
    expect(comparison.change.sessions).toBe(1) // 2 against 1: +100%
    expect(comparison.change.volumeKg).toBeCloseTo(1.01, 10) // 2,010 against 1,000
    expect(comparePeriods(workouts, window, '2026-11-06').previous).toBeNull()
    expect(comparePeriods(workouts, window, '2026-11-06').change.sessions).toBeNull()
  })

  it('has no averages over an empty window and no change from an empty one', () => {
    const empty = summarisePeriod([], windowEnding(TODAY, 28))
    expect(empty.avgSessionMin).toBeNull()
    expect(empty.avgFeel).toBeNull()
    expect(
      comparePeriods(workouts, windowEnding('2026-11-04', 3), '2026-01-01').change.sessions,
    ).toBeNull()
  })
})

describe('weeklyTotals', () => {
  it('splits the window into Monday weeks, empty and part weeks included', () => {
    const workouts = [
      session('2026-11-04', [block(SQUAT, 'Squat', [set(100, 5)])]),
      session('2026-11-17', [block(SQUAT, 'Squat', [set(100, 5), set(100, 5)])]),
    ]
    // Nov 1 (a Sunday) to Nov 18: the week of Oct 26 holds one day of the window.
    const weeks = weeklyTotals(workouts, { from: '2026-11-01', to: TODAY })
    expect(weeks.map((week) => [week.weekStart, week.days, week.sessions, week.volumeKg])).toEqual([
      ['2026-10-26', 1, 0, 0],
      ['2026-11-02', 7, 1, 500],
      ['2026-11-09', 7, 0, 0],
      ['2026-11-16', 3, 1, 1000],
    ])
  })
})

describe('weekStreaks', () => {
  const squat = () => [block(SQUAT, 'Squat', [set(100, 5)])]

  it('counts back from this week when it has a session', () => {
    const workouts = [
      session('2026-11-17', squat()),
      session('2026-11-10', squat()),
      session('2026-11-03', squat()),
      // A gap week (Oct 27), then three in a row before it.
      session('2026-10-21', squat()),
      session('2026-10-14', squat()),
      session('2026-10-07', squat()),
      session('2026-09-30', squat()),
    ]
    expect(weekStreaks(workouts, TODAY)).toEqual({ current: 3, longest: 4, thisWeek: true })
  })

  it('keeps the run alive through a week that has not had its session yet', () => {
    const workouts = [session('2026-11-10', squat()), session('2026-11-03', squat())]
    expect(weekStreaks(workouts, TODAY)).toEqual({ current: 2, longest: 2, thisWeek: false })
    expect(weekStreaks(workouts, '2026-11-25')).toEqual({ current: 0, longest: 2, thisWeek: false })
  })
})

describe('trainingCalendar and sessionsByWeekday', () => {
  it('grids the window by week with levels against the busiest day', () => {
    const workouts = [
      // 4 sets on Monday the 16th, 1 set on Wednesday the 18th, 2 sets on the 10th.
      session('2026-11-16', [
        block(SQUAT, 'Squat', [set(100, 5), set(100, 5), set(100, 5), set(100, 5)]),
      ]),
      session('2026-11-18', [block(SQUAT, 'Squat', [set(100, 5)])]),
      session('2026-11-10', [block(SQUAT, 'Squat', [set(100, 5), set(100, 5)])]),
      // Nothing ticked: trained, still level 1.
      session('2026-11-11', [block(SQUAT, 'Squat', [set(100, 5, false)])]),
    ]
    const grid = trainingCalendar(workouts, { from: '2026-11-11', to: TODAY })
    expect(grid).toHaveLength(2)
    expect(grid[0]?.map((day) => day.level)).toEqual([0, 0, 1, 0, 0, 0, 0])
    expect(grid[0]?.[1]).toMatchObject({ day: '2026-11-10', inWindow: false, sessions: 0 })
    expect(grid[1]?.map((day) => day.level)).toEqual([4, 0, 1, 0, 0, 0, 0])
    expect(grid[1]?.[3]?.inWindow).toBe(false)
    expect(sessionsByWeekday(workouts, { from: '2026-11-09', to: TODAY })).toEqual([
      1, 1, 2, 0, 0, 0, 0,
    ])
  })
})

describe('muscleGroupSets', () => {
  it('counts each working set once per listed group, unknown exercises as unassigned', () => {
    const groups: Record<string, MuscleGroup[]> = {
      [BENCH]: ['chest', 'triceps'],
      [SQUAT]: ['quads', 'glutes'],
    }
    const workouts = [
      session('2026-11-17', [
        block(BENCH, 'Bench', [set(60, 8), set(60, 8), set(60, 8, false)]),
        block(SQUAT, 'Squat', [set(100, 5)]),
        block(null, 'Deleted lift', [set(20, 10)]),
      ]),
    ]
    const shares = muscleGroupSets(workouts, windowEnding(TODAY, 14), (exerciseId) =>
      exerciseId ? groups[exerciseId] : undefined,
    )
    expect(shares).toEqual([
      { group: 'chest', sets: 2, perWeek: 1 },
      { group: 'triceps', sets: 2, perWeek: 1 },
      { group: 'glutes', sets: 1, perWeek: 0.5 },
      { group: 'quads', sets: 1, perWeek: 0.5 },
      { group: 'unassigned', sets: 1, perWeek: 0.5 },
    ])
  })
})

describe('estimatedOneRepMaxKg (Epley)', () => {
  it('is load × (1 + reps/30) for 2 to 12 reps, the load for one, nothing outside', () => {
    expect(estimatedOneRepMaxKg(100, 5)).toBe(116.7) // 100 × 1.1667
    expect(estimatedOneRepMaxKg(100, 1)).toBe(100)
    expect(estimatedOneRepMaxKg(60, 12)).toBe(84)
    expect(estimatedOneRepMaxKg(60, 13)).toBeNull()
    expect(estimatedOneRepMaxKg(60, 0)).toBeNull()
    expect(estimatedOneRepMaxKg(null, 5)).toBeNull()
    expect(estimatedOneRepMaxKg(0, 5)).toBeNull()
  })
})

describe('strengthTrends and mostImproved', () => {
  const workouts = [
    session('2026-10-01', [block(SQUAT, 'Squat', [set(100, 5), set(105, 3)])]),
    session('2026-10-15', [block(BENCH, 'Bench', [set(60, 8)])]),
    session('2026-10-20', [
      block(SQUAT, 'Squat', [set(110, 5)]),
      // A pull-up at 80 kg bodyweight (D44), 8 reps: 80 × (1 + 8/30) = 101.3.
      block(PULLUP, 'Pull-up', [set(null, 8)], 80),
    ]),
    session('2026-11-10', [
      // 15 reps is past the estimate; the 3-rep set counts: 120 × 1.1 = 132.
      block(SQUAT, 'Squat', [set(80, 15), set(120, 3)]),
      block(BENCH, 'Bench', [set(55, 8)]),
    ]),
  ]
  const lifts = strengthTrends(workouts, { from: '2026-09-20', to: TODAY })

  it('takes each session best estimate, oldest first, with first against latest', () => {
    const squat = lifts.find((lift) => lift.exerciseId === SQUAT)
    // 100 × 5 → 116.7 beats 105 × 3 → 115.5; then 110 × 5 → 128.3; then 132.
    expect(squat?.points.map((point) => point.e1rmKg)).toEqual([116.7, 128.3, 132])
    expect(squat?.changeKg).toBe(15.3)
    expect(squat?.changePct).toBeCloseTo(132 / 116.7 - 1, 10)
    expect(squat?.best.day).toBe('2026-11-10')
    expect(lifts.map((lift) => lift.exerciseName)).toEqual(['Squat', 'Bench', 'Pull-up'])
    expect(lifts.find((lift) => lift.exerciseId === PULLUP)?.latest.e1rmKg).toBe(101.3)
    expect(lifts.find((lift) => lift.exerciseId === PULLUP)?.changePct).toBeNull()
  })

  it('ranks the lifts that moved, gains first, and leaves out the ones done once', () => {
    expect(mostImproved(lifts).map((lift) => lift.exerciseName)).toEqual(['Squat', 'Bench'])
  })
})

describe('personalRecords', () => {
  const workouts = [
    // Before the window: sets the bar.
    session('2026-09-01', [block(SQUAT, 'Squat', [set(100, 5)])]),
    // In the window: 105 × 5 = 525 kg beats 500 kg; bench appears for the first time.
    session('2026-11-05', [
      block(SQUAT, 'Squat', [set(105, 5)]),
      block(BENCH, 'Bench', [set(60, 8)]),
    ]),
    // A tie is no record; the bench goes up.
    session('2026-11-12', [
      block(SQUAT, 'Squat', [set(105, 5)]),
      block(BENCH, 'Bench', [set(62.5, 8)]),
    ]),
    // Heavier but fewer reps: 120 × 3 = 360 kg is no record on kg lifted, it is on heaviest.
    session('2026-11-17', [block(SQUAT, 'Squat', [set(120, 3)])]),
  ]
  const window = windowEnding(TODAY, 28)

  it('lists the sessions that beat everything before, newest first (kg lifted in a set)', () => {
    const records = personalRecords(workouts, window, { measuresOf: () => ['weight', 'reps'] })
    expect(
      records.map((record) => [record.day, record.exerciseName, record.value, record.previous]),
    ).toEqual([
      ['2026-11-12', 'Bench', 500, 480],
      ['2026-11-05', 'Squat', 525, 500],
    ])
    expect(records[0]?.metric).toBe('volume')
  })

  it('follows the heaviest-weight basis (D39)', () => {
    const records = personalRecords(workouts, window, {
      measuresOf: () => ['weight', 'reps'],
      basis: 'weight',
    })
    expect(records.map((record) => [record.day, record.exerciseName, record.value])).toEqual([
      ['2026-11-17', 'Squat', 120],
      ['2026-11-12', 'Bench', 62.5],
      ['2026-11-05', 'Squat', 105],
    ])
  })
})
