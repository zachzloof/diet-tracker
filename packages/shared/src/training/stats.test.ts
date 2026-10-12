import { describe, expect, it } from 'vitest'
import type { Workout, WorkoutSet } from './schemas.js'
import {
  bestSet,
  emptyWorkout,
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
