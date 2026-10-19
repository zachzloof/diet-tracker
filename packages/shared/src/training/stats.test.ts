import { describe, expect, it } from 'vitest'
import type { Workout, WorkoutSet } from './schemas.js'
import {
  bestSet,
  bestSetAt,
  bestSetBy,
  emptyWorkout,
  liftMetric,
  primaryMeasure,
  setMetricValue,
  nextSet,
  repeatWorkout,
  setVolumeKg,
  summariseWorkouts,
  topSet,
  workoutDurationMin,
  workoutSummary,
} from './stats.js'

let n = 0
const id = () => `0199c000-0000-7000-8000-${String(++n).padStart(12, '0')}`

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

const squat = {
  id: id(),
  exerciseId: id(),
  exerciseName: 'Barbell back squat',
  notes: '',
  sets: [
    set({ weightKg: 60, reps: 5, isWarmup: true }),
    set({ weightKg: 100, reps: 5 }),
    set({ weightKg: 100, reps: 5 }),
    set({ weightKg: 102.5, reps: 3 }),
    set({ weightKg: 105, reps: 1, completed: false }),
  ],
}
const plank = {
  id: id(),
  exerciseId: id(),
  exerciseName: 'Plank',
  notes: '',
  sets: [set({ durationS: 60 })],
}

const pushA: Workout = {
  id: id(),
  day: '2026-10-08',
  startedAt: '2026-10-08T17:00:00.000Z',
  endedAt: '2026-10-08T17:48:30.000Z',
  title: 'Push A',
  notes: 'felt good',
  feel: 4,
  exercises: [squat, plank],
  createdAt: '2026-10-08T17:00:00.000Z',
  updatedAt: '2026-10-08T17:48:30.000Z',
}

describe('set volume', () => {
  it('is weight × reps for a working set', () => {
    expect(setVolumeKg(set({ weightKg: 100, reps: 5 }))).toBe(500)
  })
  it('is 0 for warm-ups, undone sets and sets without weight or reps', () => {
    expect(setVolumeKg(set({ weightKg: 100, reps: 5, isWarmup: true }))).toBe(0)
    expect(setVolumeKg(set({ weightKg: 100, reps: 5, completed: false }))).toBe(0)
    expect(setVolumeKg(set({ durationS: 60 }))).toBe(0)
    expect(setVolumeKg(set({ weightKg: 100, reps: null }))).toBe(0)
  })
})

describe('workoutSummary', () => {
  it('adds up the working sets of the session', () => {
    // 100×5 + 100×5 + 102.5×3 = 1307.5; the warm-up and the undone single do not count.
    expect(workoutSummary(pushA)).toEqual({
      volumeKg: 1307.5,
      workingSets: 4,
      exercisesDone: 2,
      durationMin: 49,
    })
  })
  it('has no duration while the session is open, and never a negative one', () => {
    expect(workoutDurationMin({ ...pushA, endedAt: null })).toBeNull()
    expect(workoutDurationMin({ ...pushA, endedAt: '2026-10-08T16:00:00.000Z' })).toBe(0)
  })
  it('is all zeros for an empty session', () => {
    expect(workoutSummary(emptyWorkout('2026-10-08', pushA.startedAt))).toEqual({
      volumeKg: 0,
      workingSets: 0,
      exercisesDone: 0,
      durationMin: null,
    })
  })
})

describe('summariseWorkouts', () => {
  it('adds up finished sessions only, counting distinct days', () => {
    const pushB: Workout = { ...pushA, id: id(), day: '2026-10-08', title: 'Push B' }
    const open: Workout = { ...pushA, id: id(), day: '2026-10-09', endedAt: null }
    const legs: Workout = {
      ...pushA,
      id: id(),
      day: '2026-10-10',
      startedAt: '2026-10-10T07:00:00.000Z',
      endedAt: '2026-10-10T08:00:00.000Z',
      exercises: [plank],
    }
    expect(summariseWorkouts([pushA, pushB, open, legs])).toEqual({
      sessions: 3,
      daysTrained: 2,
      workingSets: 9,
      volumeKg: 2615,
      minutes: 158,
    })
  })
  it('is all zeros with nothing finished', () => {
    expect(summariseWorkouts([{ ...pushA, endedAt: null }])).toEqual({
      sessions: 0,
      daysTrained: 0,
      workingSets: 0,
      volumeKg: 0,
      minutes: 0,
    })
  })
})

describe('topSet', () => {
  it('is the heaviest working set, reps breaking ties', () => {
    expect(topSet(squat.sets)?.weightKg).toBe(102.5)
    const tie = [set({ weightKg: 80, reps: 6 }), set({ weightKg: 80, reps: 8 })]
    expect(topSet(tie)?.reps).toBe(8)
  })
  it('ignores warm-ups and undone sets', () => {
    expect(
      topSet([set({ weightKg: 60, isWarmup: true }), set({ weightKg: 50, completed: false })]),
    ).toBeNull()
  })
})

describe('bestSet', () => {
  it('is the heaviest set for weight, the most reps, the longest time, the furthest distance', () => {
    expect(bestSet(squat.sets, 'weight')?.weightKg).toBe(102.5)
    expect(bestSet(squat.sets, 'reps')?.reps).toBe(5)
    const timed = [set({ durationS: 45 }), set({ durationS: 70 }), set({ durationS: 60 })]
    expect(bestSet(timed, 'time')?.durationS).toBe(70)
    const runs = [set({ distanceM: 5000, durationS: 1500 }), set({ distanceM: 3000 })]
    expect(bestSet(runs, 'distance')?.distanceM).toBe(5000)
  })
  it('ignores warm-ups, undone sets and sets without that measure', () => {
    expect(bestSet([set({ durationS: 90, isWarmup: true }), set({ reps: 10 })], 'time')).toBeNull()
    expect(bestSet([set({ reps: 12, completed: false })], 'reps')).toBeNull()
  })
})

describe('bestSetBy', () => {
  it('ranks on kilograms lifted in one set: heavier breaks a tie, then more reps', () => {
    // 100 × 5 = 500 beats 102.5 × 3 = 307.5; the first of two equal sets wins.
    expect(bestSetBy(squat.sets, 'volume')).toBe(squat.sets[1])
    const tie = [set({ weightKg: 50, reps: 10 }), set({ weightKg: 100, reps: 5 })]
    expect(bestSetBy(tie, 'volume')?.weightKg).toBe(100)
    const sameBar = [set({ weightKg: 80, reps: 6 }), set({ weightKg: 80, reps: 8 })]
    expect(bestSetBy(sameBar, 'volume')?.reps).toBe(8)
    // A set without reps has no volume; by weight it still counts.
    const carry = [set({ weightKg: 24, distanceM: 40 }), set({ weightKg: 28, distanceM: 30 })]
    expect(bestSetBy(carry, 'volume')).toBeNull()
    expect(bestSetBy(carry, 'weight')?.weightKg).toBe(28)
  })
  it('matches topSet and bestSet on their measures', () => {
    expect(bestSetBy(squat.sets, 'weight')).toBe(topSet(squat.sets))
    expect(bestSetBy(squat.sets, 'reps')).toBe(bestSet(squat.sets, 'reps'))
    expect(bestSetBy(plank.sets, 'time')).toBe(plank.sets[0])
  })
})

describe('setMetricValue', () => {
  it('is weight × reps for volume and the measure otherwise', () => {
    expect(setMetricValue(set({ weightKg: 30, reps: 15 }), 'volume')).toBe(450)
    expect(setMetricValue(set({ weightKg: 30 }), 'volume')).toBeNull()
    expect(setMetricValue(set({ reps: 15 }), 'volume')).toBeNull()
    expect(setMetricValue(set({ weightKg: 30, reps: 15 }), 'weight')).toBe(30)
    expect(setMetricValue(set({ durationS: 60 }), 'time')).toBe(60)
  })
})

describe('liftMetric and primaryMeasure', () => {
  it('ranks weight-and-reps lifts on volume by default and on weight when asked', () => {
    expect(liftMetric('weight', 'volume', true)).toBe('volume')
    expect(liftMetric('weight', 'weight', true)).toBe('weight')
    expect(liftMetric('weight', 'volume', false)).toBe('weight')
    expect(liftMetric('reps', 'volume', true)).toBe('reps')
    expect(liftMetric('time', 'volume', false)).toBe('time')
  })
  it('takes the first declared measure in weight, reps, time, distance order', () => {
    expect(primaryMeasure(['reps', 'weight'])).toBe('weight')
    expect(primaryMeasure(['distance', 'time'])).toBe('time')
    expect(primaryMeasure([])).toBeNull()
  })
})

describe('bestSetAt', () => {
  const sessions = [
    { sets: [set({ weightKg: 35, reps: 10 }), set({ weightKg: 35, reps: 8 })] },
    { sets: [set({ weightKg: 30, reps: 15 }), set({ weightKg: 40, reps: 1 }), set({ reps: 5 })] },
    {
      sets: [
        set({ weightKg: 50, reps: 10, isWarmup: true }),
        set({ weightKg: 45, reps: 8, completed: false }),
      ],
    },
  ]
  it('is the best working set at that position across the sessions, by the metric', () => {
    // 30 × 15 = 450 beats 35 × 10 = 350; by weight 35 wins; the warm-up 50 never counts.
    expect(bestSetAt(sessions, 0, 'volume')).toBe(sessions[1]?.sets[0])
    expect(bestSetAt(sessions, 0, 'weight')).toBe(sessions[0]?.sets[0])
    // 40 × 1 = 40 loses to 35 × 8 = 280 but wins on weight; the unticked 45 never counts.
    expect(bestSetAt(sessions, 1, 'volume')).toBe(sessions[0]?.sets[1])
    expect(bestSetAt(sessions, 1, 'weight')).toBe(sessions[1]?.sets[1])
  })
  it('is null when no session reached that position with a working set on the metric', () => {
    expect(bestSetAt(sessions, 2, 'volume')).toBeNull()
    expect(bestSetAt(sessions, 2, 'reps')?.reps).toBe(5)
    expect(bestSetAt(sessions, 3, 'volume')).toBeNull()
    expect(bestSetAt([], 0, 'volume')).toBeNull()
  })
})

describe('repeatWorkout', () => {
  it('copies the exercises and sets with fresh ids, nothing done and no finish', () => {
    const repeated = repeatWorkout(pushA, {
      day: '2026-10-10',
      startedAt: '2026-10-10T17:00:00.000Z',
      newId: id,
    })
    expect(repeated.title).toBe('Push A')
    expect(repeated.day).toBe('2026-10-10')
    expect(repeated.endedAt).toBeNull()
    expect(repeated.notes).toBe('')
    expect(repeated.feel).toBeNull()
    expect(repeated.exercises.map((block) => block.exerciseName)).toEqual([
      'Barbell back squat',
      'Plank',
    ])
    const block = repeated.exercises[0]
    expect(block?.id).not.toBe(squat.id)
    expect(block?.exerciseId).toBe(squat.exerciseId)
    expect(block?.sets.map((s) => s.weightKg)).toEqual([60, 100, 100, 102.5, 105])
    expect(block?.sets.every((s) => !s.completed)).toBe(true)
    expect(block?.sets[0]?.isWarmup).toBe(true)
    expect(new Set(block?.sets.map((s) => s.id)).size).toBe(5)
  })
})

describe('nextSet', () => {
  it('copies the last set, not done and not a warm-up', () => {
    const next = nextSet(squat.sets, 'new')
    expect(next).toMatchObject({
      id: 'new',
      weightKg: 105,
      reps: 1,
      completed: false,
      isWarmup: false,
    })
  })
  it('is blank for the first set', () => {
    expect(nextSet([], 'new')).toEqual({
      id: 'new',
      weightKg: null,
      reps: null,
      durationS: null,
      distanceM: null,
      rpe: null,
      isWarmup: false,
      completed: false,
    })
  })
})
