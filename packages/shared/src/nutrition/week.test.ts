import { describe, expect, it } from 'vitest'
import { NO_FLAGS } from '../profile.js'
import { emptyFoodGroupServes, emptyNutrientVector } from './nutrients.js'
import { evaluateDay, type DayScore } from './scoring.js'
import { computeTargets, type TargetInput } from './targets.js'
import {
  currentStreak,
  emptyDayScore,
  summariseTarget,
  summariseWeek,
  weekWindow,
  type ScoredDay,
} from './week.js'

const finn: TargetInput = {
  sex: 'male',
  age: 28,
  heightCm: 178,
  weightKg: 75,
  bodyFatPct: null,
  activity: 'high',
  trainingType: 'combat',
  trainingDaysPerWeek: 6,
  goal: 'gain',
  pace: 'lean',
  goalWeightKg: null,
  dietPattern: 'omnivore',
  flags: NO_FLAGS,
}
const targets = computeTargets(finn)

function met(energy = 3250, protein = 150): DayScore {
  return evaluateDay(
    {
      totals: { ...emptyNutrientVector(), energy_kcal: energy, protein_g: protein },
      foodGroups: emptyFoodGroupServes(),
      entryCount: 3,
    },
    targets,
  )
}
const missed = () => met(3250, 100)

describe('weekWindow', () => {
  it('returns the seven days ending on the given day, oldest first, across a month edge', () => {
    expect(weekWindow('2026-10-02')).toEqual([
      '2026-09-26',
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ])
  })
})

describe('currentStreak', () => {
  const days = (scores: Record<string, DayScore>): ScoredDay[] =>
    Object.entries(scores).map(([day, score]) => ({ day, score }))

  it('counts back from today when today is met', () => {
    const streak = currentStreak(
      days({ '2026-09-24': met(), '2026-09-25': met(), '2026-09-26': met() }),
      '2026-09-26',
    )
    expect(streak).toBe(3)
  })

  it('counts back from yesterday when today is not met yet', () => {
    const streak = currentStreak(
      days({ '2026-09-24': met(), '2026-09-25': met(), '2026-09-26': emptyDayScore() }),
      '2026-09-26',
    )
    expect(streak).toBe(2)
  })

  it('is broken by an unlogged or missed day', () => {
    expect(
      currentStreak(
        days({ '2026-09-23': met(), '2026-09-24': emptyDayScore(), '2026-09-25': met() }),
        '2026-09-26',
      ),
    ).toBe(1)
    expect(currentStreak(days({ '2026-09-24': met(), '2026-09-25': missed() }), '2026-09-26')).toBe(
      0,
    )
    expect(currentStreak([], '2026-09-26')).toBe(0)
  })
})

describe('summariseTarget and summariseWeek', () => {
  const week: ScoredDay[] = [
    { day: '2026-09-20', score: met(3000, 150) },
    { day: '2026-09-21', score: met(2600, 120) }, // energy close, protein close
    { day: '2026-09-22', score: emptyDayScore() },
    { day: '2026-09-23', score: met(3300, 160) },
    { day: '2026-09-24', score: met(4000, 150) }, // energy over
    { day: '2026-09-25', score: met(3250, 150) },
    { day: '2026-09-26', score: met(700, 40) }, // logged (3 entries) but short
  ]

  it('summarises one target across the window with a status per day', () => {
    const energy = summariseTarget(week, 'energy_kcal')
    expect(energy.daysLogged).toBe(6)
    expect(energy.daysMet).toBe(3)
    expect(energy.statuses).toEqual(['met', 'close', null, 'met', 'over', 'met', 'short'])
    expect(energy.average).toBeCloseTo((3000 + 2600 + 3300 + 4000 + 3250 + 700) / 6, 6)
    expect(energy.averageRatio).toBeCloseTo(energy.average! / 3250, 6)
    expect(energy.target).toBe(3250)
  })

  it('summarises the week: logged days, met days and mean completeness', () => {
    const summary = summariseWeek(week)
    expect(summary.daysLogged).toBe(6)
    expect(summary.daysMet).toBe(3)
    expect(summary.completeness).toBe(0)
  })

  it('returns nulls for an empty window', () => {
    const none = summariseTarget([], 'protein_g')
    expect(none).toMatchObject({
      daysMet: 0,
      daysLogged: 0,
      average: null,
      averageRatio: null,
      target: null,
    })
  })
})
