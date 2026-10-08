import type { WorkoutSet } from '@diet-tracker/shared'
import { describe, expect, it } from 'vitest'
import { formatDuration, parseNumber, sessionLine, setLabel } from './draft'

function set(partial: Partial<WorkoutSet>): WorkoutSet {
  return {
    id: 'set',
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

describe('setLabel', () => {
  it('reads weight × reps, reps alone, time, and distance in time', () => {
    expect(setLabel(set({ weightKg: 102.5, reps: 3 }), ['weight', 'reps'])).toBe('102.5 kg × 3')
    expect(setLabel(set({ reps: 12 }), ['reps'])).toBe('12 reps')
    expect(setLabel(set({ weightKg: 20, reps: 12 }), ['reps'])).toBe('12 reps')
    expect(setLabel(set({ durationS: 90 }), ['time'])).toBe('1 min 30 s')
    expect(setLabel(set({ distanceM: 2500, durationS: 720 }), ['time', 'distance'])).toBe(
      '2.5 km in 12 min',
    )
    expect(setLabel(set({}), ['weight', 'reps'])).toBe('')
  })
})

describe('sessionLine', () => {
  it('lists duration, working sets and volume', () => {
    const line = sessionLine({
      startedAt: '2026-10-08T17:00:00.000Z',
      endedAt: '2026-10-08T18:15:00.000Z',
      exercises: [
        {
          id: 'b',
          exerciseId: null,
          exerciseName: 'Squat',
          notes: '',
          sets: [set({ weightKg: 100, reps: 5 }), set({ weightKg: 60, reps: 5, isWarmup: true })],
        },
      ],
    })
    expect(line).toBe('1 h 15 min · 1 set · 500 kg')
  })
  it('leaves out what does not apply', () => {
    expect(
      sessionLine({ startedAt: '2026-10-08T17:00:00.000Z', endedAt: null, exercises: [] }),
    ).toBe('0 sets')
  })
})

describe('formatDuration and parseNumber', () => {
  it('formats minutes and hours', () => {
    expect(formatDuration(48)).toBe('48 min')
    expect(formatDuration(60)).toBe('1 h')
    expect(formatDuration(75)).toBe('1 h 15 min')
  })
  it('parses typed numbers leniently', () => {
    expect(parseNumber(' 102,5 ')).toBe(102.5)
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('abc')).toBeNull()
  })
})
