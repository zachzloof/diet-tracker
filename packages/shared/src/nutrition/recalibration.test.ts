import { describe, expect, it } from 'vitest'
import { addDays } from '../dates.js'
import { NO_FLAGS } from '../profile.js'
import { emptyFoodGroupServes, emptyNutrientVector } from './nutrients.js'
import { RECALIBRATION, assessRecalibration, type RecalibrationContext } from './recalibration.js'
import { evaluateDay } from './scoring.js'
import { computeTargets, targetValue, type TargetInput } from './targets.js'
import type { ScoredDay } from './week.js'
import type { WeightPoint } from './weight.js'

/** Tess (targets.md): 1570 kcal, gentle loss of 0.25 kg a week; TDEE 1843, so the 25% clamp is 1380. */
const tess: TargetInput = {
  sex: 'female',
  age: 30,
  heightCm: 160,
  weightKg: 50,
  bodyFatPct: null,
  activity: 'moderate',
  trainingType: 'general',
  trainingDaysPerWeek: 3,
  goal: 'lose',
  pace: 'gentle',
  goalWeightKg: 48,
  dietPattern: 'omnivore',
  flags: NO_FLAGS,
}

/** Finn: 3250 kcal, lean gain of 0.25 kg a week. */
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
  goalWeightKg: 80,
  dietPattern: 'omnivore',
  flags: NO_FLAGS,
}

const TODAY = '2026-09-26'
const START = addDays(TODAY, -13)

/** `count` logged days at `kcal`, oldest first, ending yesterday; today stays in progress. */
function loggedDays(input: TargetInput, count: number, kcal: number): ScoredDay[] {
  const targets = computeTargets(input)
  const protein = targetValue(targets, 'protein_g')
  return Array.from({ length: 14 }, (_, i) => {
    const day = addDays(START, i)
    const offsetFromEnd = 13 - i
    const logged = offsetFromEnd >= 1 && offsetFromEnd <= count
    const totals = logged
      ? { ...emptyNutrientVector(), energy_kcal: kcal, protein_g: protein }
      : emptyNutrientVector()
    return {
      day,
      score: evaluateDay(
        { totals, foodGroups: emptyFoodGroupServes(), entryCount: logged ? 3 : 0 },
        targets,
      ),
    }
  })
}

/** Weigh-ins every other day across the window, moving linearly by `kgPerWeek`. */
function weighIns(startKg: number, kgPerWeek: number, every = 2): WeightPoint[] {
  const points: WeightPoint[] = []
  for (let offset = 0; offset < 14; offset += every) {
    const day = addDays(START, offset)
    points.push({ day, weightKg: Math.round((startKg + (kgPerWeek * offset) / 7) * 100) / 100 })
  }
  return points
}

function context(
  input: TargetInput,
  overrides: Partial<RecalibrationContext> = {},
): RecalibrationContext {
  const current = computeTargets(input, {})
  return {
    today: TODAY,
    effectiveFrom: addDays(TODAY, -RECALIBRATION.intervalDays),
    snoozedUntil: null,
    inputs: input,
    overrides: {},
    current,
    days: loggedDays(input, 12, targetValue(current, 'energy_kcal')),
    weights: weighIns(input.weightKg, 0),
    ...overrides,
  }
}

describe('assessRecalibration', () => {
  it('is not due until the current targets are 14 days old', () => {
    const result = assessRecalibration(context(tess, { effectiveFrom: addDays(TODAY, -5) }))
    expect(result.status).toBe('not_due')
    expect(result.dueOn).toBe(addDays(TODAY, 9))
    expect(result.proposal).toBeNull()
  })

  it('respects a snooze', () => {
    const result = assessRecalibration(context(tess, { snoozedUntil: addDays(TODAY, 3) }))
    expect(result.status).toBe('not_due')
    expect(result.dueOn).toBe(addDays(TODAY, 3))
  })

  it('asks for more data with too few logged days or weigh-ins', () => {
    const fewDays = assessRecalibration(context(tess, { days: loggedDays(tess, 6, 1500) }))
    expect(fewDays.status).toBe('not_enough_data')
    expect(fewDays.reason).toMatch(/log 4 more days/)
    expect(fewDays.evidence.daysLogged).toBe(6)

    const fewWeights = assessRecalibration(context(tess, { weights: weighIns(50, 0).slice(0, 3) }))
    expect(fewWeights.status).toBe('not_enough_data')
    expect(fewWeights.reason).toMatch(/weigh in 1 more time/)

    const bunched = assessRecalibration(
      context(tess, {
        weights: [0, 1, 2, 3].map((offset) => ({ day: addDays(TODAY, -offset), weightKg: 50 })),
      }),
    )
    expect(bunched.status).toBe('not_enough_data')
    expect(bunched.reason).toMatch(/spread your weigh-ins/)
  })

  it('a stalled fortnight on a fat-loss plan proposes eating less, bounded and clamped', () => {
    const result = assessRecalibration(context(tess))
    expect(result.status).toBe('proposal')
    expect(result.evidence.actualKgPerWeek).toBe(0)
    expect(result.evidence.expectedKgPerWeek).toBe(-0.25)
    expect(result.evidence.averageIntakeKcal).toBe(1570)
    const proposal = result.proposal!
    expect(proposal.current.energyKcal).toBe(1570)
    // Raw gap 0.25 kg/week is 275 kcal, bounded to 200, then the 25% deficit clamp (1380) binds.
    expect(proposal.proposed.energyKcal).toBe(1380)
    expect(proposal.deltaKcal).toBe(-190)
    expect(proposal.recalibrationKcal).toBe(-186)
    expect(proposal.notes.join(' ')).toMatch(/25% deficit/)
    expect(proposal.proposed.proteinG).toBe(100)
    expect(proposal.proposed.carbsG).toBeLessThan(190)
    expect(result.reason).toMatch(/losing less than planned/)
    expect(result.reason).toMatch(/190 kcal less/)
  })

  it('gaining more slowly than planned proposes eating more, capped at 200 kcal', () => {
    const result = assessRecalibration(context(finn, { weights: weighIns(75, -0.1) }))
    expect(result.status).toBe('proposal')
    const proposal = result.proposal!
    expect(proposal.deltaKcal).toBe(200)
    expect(proposal.proposed.energyKcal).toBe(3450)
    expect(proposal.recalibrationKcal).toBe(200)
    expect(proposal.weightKg).toBeCloseTo(74.8, 1)
    expect(result.reason).toMatch(/200 kcal more/)
  })

  it('a small miss inside the tolerance is on track', () => {
    const result = assessRecalibration(context(finn, { weights: weighIns(75, 0.35) }))
    expect(result.status).toBe('on_track')
    // The trailing average lags a steady climb, so the measured rate sits a little under 0.35.
    expect(result.evidence.actualKgPerWeek).toBeGreaterThan(0.2)
    expect(result.evidence.actualKgPerWeek).toBeLessThan(0.4)
    expect(result.proposal).toBeNull()
  })

  it('accumulates across rounds and stores only the part that took effect', () => {
    const first = assessRecalibration(context(tess))
    const adjusted: TargetInput = { ...tess, recalibrationKcal: first.proposal!.recalibrationKcal }
    const second = assessRecalibration(context(adjusted))
    // Already at the 25% clamp: nothing more to give.
    expect(second.status).toBe('unavailable')
    expect(second.reason).toMatch(/safe limit/)
  })

  it('leaves a pinned energy target and a flagged person alone', () => {
    const pinned = assessRecalibration(
      context(tess, {
        overrides: { energy_kcal: 1600 },
        current: computeTargets(tess, { energy_kcal: 1600 }),
      }),
    )
    expect(pinned.status).toBe('unavailable')
    expect(pinned.reason).toMatch(/set by you/)

    const flaggedInput: TargetInput = { ...tess, flags: { ...NO_FLAGS, pregnant: true } }
    const flagged = assessRecalibration(context(flaggedInput))
    expect(flagged.status).toBe('unavailable')
    expect(flagged.reason).toMatch(/health answers/)
  })
})

describe('computeTargets with recalibrationKcal', () => {
  it('shifts energy and re-derives the macros, naming the adjustment in the reason', () => {
    const targets = computeTargets({ ...finn, recalibrationKcal: 150 })
    expect(targetValue(targets, 'energy_kcal')).toBe(3400)
    expect(targets.meta.recalibrationKcal).toBe(150)
    expect(targets.meta.energyAdjustmentKcal).toBe(425)
    const energy = targets.entries.find((e) => e.key === 'energy_kcal')!
    expect(energy.reason).toMatch(/plus 150 kcal from recalibration/)
    expect(targetValue(targets, 'carbs_g')).toBeGreaterThan(460)
  })

  it('is ignored for a flagged person', () => {
    const targets = computeTargets({
      ...tess,
      flags: { ...NO_FLAGS, edHistory: true },
      recalibrationKcal: -200,
    })
    expect(targets.meta.recalibrationKcal).toBe(0)
    expect(targetValue(targets, 'energy_kcal')).toBe(1840)
  })
})
