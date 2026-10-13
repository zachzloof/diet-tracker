import { describe, expect, it } from 'vitest'
import { biggestDrop, biggestGain, compareWeeks, inferMeasure, tonnageParts } from './insights.js'
import type { WorkoutInput, WorkoutSet } from './schemas.js'

let n = 0
const id = () => `0199c100-0000-7000-8000-${String(++n).padStart(12, '0')}`

function set(partial: Partial<WorkoutSet>): WorkoutSet {
  return {
    id: id(),
    weightKg: null,
    reps: null,
    durationS: null,
    distanceM: null,
    rpe: null,
    isWarmup: false,
    completed: true,
    ...partial,
  }
}

const SQUAT = id()
const BENCH = id()
const PLANK = id()
const RUN = id()

function block(exerciseId: string | null, exerciseName: string, sets: WorkoutSet[]) {
  return { id: id(), exerciseId, exerciseName, notes: '', sets }
}

function session(day: string, exercises: WorkoutInput['exercises'], finished = true): WorkoutInput {
  return {
    day,
    startedAt: `${day}T17:00:00.000Z`,
    endedAt: finished ? `${day}T17:45:00.000Z` : null,
    title: '',
    notes: '',
    feel: null,
    exercises,
  }
}

const lastWeek: WorkoutInput[] = [
  session('2026-09-29', [
    block(SQUAT, 'Barbell back squat', [
      set({ weightKg: 60, reps: 5, isWarmup: true }),
      set({ weightKg: 100, reps: 5 }),
      set({ weightKg: 100, reps: 5 }),
    ]),
    block(BENCH, 'Barbell bench press', [
      set({ weightKg: 80, reps: 5 }),
      set({ weightKg: 80, reps: 5 }),
    ]),
  ]),
  session('2026-10-02', [
    block(SQUAT, 'Barbell back squat', [set({ weightKg: 102.5, reps: 3 })]),
    block(PLANK, 'Plank', [set({ durationS: 60 })]),
  ]),
]

const thisWeek: WorkoutInput[] = [
  session('2026-10-06', [
    block(SQUAT, 'Barbell back squat', [
      set({ weightKg: 105, reps: 5 }),
      set({ weightKg: 110, reps: 1, completed: false }),
    ]),
    block(BENCH, 'Barbell bench press', [set({ weightKg: 77.5, reps: 6 })]),
    block(RUN, 'Run', [set({ durationS: 1800, distanceM: 5000 })]),
  ]),
  session('2026-10-09', [block(PLANK, 'Plank', [set({ durationS: 75 })])]),
  // Still open: nothing in it counts yet.
  session(
    '2026-10-10',
    [block(SQUAT, 'Barbell back squat', [set({ weightKg: 120, reps: 1 })])],
    false,
  ),
]

describe('compareWeeks', () => {
  const comparison = compareWeeks(thisWeek, lastWeek)

  it('totals both weeks by the week rules (finished sessions, working sets)', () => {
    expect(comparison.previous).toEqual({
      sessions: 2,
      daysTrained: 2,
      workingSets: 6,
      volumeKg: 1000 + 800 + 307.5,
      minutes: 90,
    })
    expect(comparison.current.sessions).toBe(2)
    expect(comparison.current.workingSets).toBe(4)
    expect(comparison.current.volumeKg).toBe(525 + 465)
    expect(comparison.volumeChangePct).toBeCloseTo((990 - 2107.5) / 2107.5)
  })

  it('compares each exercise done in both weeks on its measure, biggest relative gain first', () => {
    expect(comparison.lifts.map((lift) => lift.exerciseName)).toEqual([
      'Plank',
      'Barbell back squat',
      'Barbell bench press',
    ])
    const [plank, squat, bench] = comparison.lifts
    expect(plank).toMatchObject({ measure: 'time', delta: 15, deltaPct: 0.25 })
    expect(squat).toMatchObject({ measure: 'weight', delta: 2.5 })
    expect(squat?.deltaPct).toBeCloseTo(2.5 / 102.5)
    expect(squat?.current).toMatchObject({ value: 105, sets: 1, volumeKg: 525, sessions: 1 })
    expect(squat?.previous).toMatchObject({ value: 102.5, sets: 3, volumeKg: 1307.5, sessions: 2 })
    // A heavier set with fewer reps is still the week's best on weight.
    expect(bench).toMatchObject({ measure: 'weight', delta: -2.5 })
    expect(bench?.current.best.reps).toBe(6)
  })

  it('lists exercises done in only one of the weeks', () => {
    expect(comparison.onlyThisWeek.map((lift) => [lift.exerciseName, lift.measure])).toEqual([
      ['Run', 'time'],
    ])
    expect(comparison.onlyLastWeek).toEqual([])
    const quiet = compareWeeks([thisWeek[1]!], lastWeek)
    expect(quiet.onlyLastWeek.map((lift) => lift.exerciseName)).toEqual([
      'Barbell back squat',
      'Barbell bench press',
    ])
  })

  it('picks the biggest gain and the biggest drop', () => {
    expect(biggestGain(comparison)?.exerciseName).toBe('Plank')
    expect(biggestDrop(comparison)?.exerciseName).toBe('Barbell bench press')
    const allUp = compareWeeks([thisWeek[1]!], [lastWeek[1]!])
    expect(biggestGain(allUp)?.exerciseName).toBe('Plank')
    expect(biggestDrop(allUp)).toBeNull()
  })

  it('uses the declared measure when the screen knows the exercise', () => {
    const byReps = compareWeeks(thisWeek, lastWeek, {
      measureOf: (exerciseId) => (exerciseId === BENCH ? 'reps' : null),
    })
    const bench = byReps.lifts.find((lift) => lift.exerciseId === BENCH)
    expect(bench).toMatchObject({ measure: 'reps', delta: 1, deltaPct: 0.2 })
  })

  it('matches a deleted custom exercise by name', () => {
    const before = [session('2026-10-01', [block(null, 'Pistol squat', [set({ reps: 6 })])])]
    const after = [session('2026-10-08', [block(null, 'pistol squat', [set({ reps: 8 })])])]
    const result = compareWeeks(after, before)
    expect(result.lifts).toHaveLength(1)
    expect(result.lifts[0]).toMatchObject({ exerciseId: null, measure: 'reps', delta: 2 })
  })

  it('has no percentage when last week lifted nothing, and ranks such a gain first', () => {
    const before = [
      session('2026-10-01', [block(SQUAT, 'Squat', [set({ weightKg: 0, reps: 10 })])]),
    ]
    const after = [
      session('2026-10-08', [block(SQUAT, 'Squat', [set({ weightKg: 20, reps: 10 })])]),
    ]
    const result = compareWeeks(after, before)
    expect(result.volumeChangePct).toBeNull()
    expect(result.lifts[0]).toMatchObject({ delta: 20, deltaPct: null })
  })

  it('is empty on both sides with nothing finished', () => {
    const result = compareWeeks([thisWeek[2]!], [])
    expect(result.current.sessions).toBe(0)
    expect(result.lifts).toEqual([])
    expect(result.onlyThisWeek).toEqual([])
    expect(result.volumeChangePct).toBeNull()
  })
})

describe('inferMeasure', () => {
  it('prefers weight, then reps, time, distance, from what the sets recorded', () => {
    expect(inferMeasure([{ sets: [set({ weightKg: 50, reps: 5 })] }])).toBe('weight')
    expect(inferMeasure([{ sets: [set({ reps: 12 })] }])).toBe('reps')
    expect(inferMeasure([{ sets: [set({ durationS: 600, distanceM: 2000 })] }])).toBe('time')
    expect(inferMeasure([{ sets: [set({ distanceM: 400 })] }])).toBe('distance')
    expect(inferMeasure([{ sets: [set({})] }])).toBeNull()
  })
})

describe('tonnageParts', () => {
  it('reads kilograms up to 999 and tonnes from 1,000 kg', () => {
    expect(tonnageParts(0)).toEqual({ value: 0, unit: 'kg', decimals: 0 })
    expect(tonnageParts(999.4)).toEqual({ value: 999, unit: 'kg', decimals: 0 })
    expect(tonnageParts(999.6)).toEqual({ value: 1, unit: 't', decimals: 1 })
    expect(tonnageParts(1307.5)).toEqual({ value: 1.3, unit: 't', decimals: 1 })
    expect(tonnageParts(9960)).toEqual({ value: 10, unit: 't', decimals: 1 })
    expect(tonnageParts(12_345)).toEqual({ value: 12, unit: 't', decimals: 0 })
    expect(tonnageParts(123_456)).toEqual({ value: 123, unit: 't', decimals: 0 })
  })
})
