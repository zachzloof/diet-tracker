import { describe, expect, it } from 'vitest'
import { NO_FLAGS } from '../profile.js'
import { emptyFoodGroupServes, emptyNutrientVector, type NutrientVector } from './nutrients.js'
import { evaluateDay, scoreTarget, type DayTotals } from './scoring.js'
import { computeTargets, targetFor, type TargetInput, type TargetKey } from './targets.js'

/** Finn from targets.md: energy 3250, protein 150, carbs 460, fat 90, fibre 45, sodium 2300. */
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
const entry = (key: TargetKey) => {
  const found = targetFor(targets, key)
  if (!found) throw new Error(`no target ${key}`)
  return found
}

function day(nutrients: Partial<NutrientVector>, entryCount = 3): DayTotals {
  return {
    totals: { ...emptyNutrientVector(), ...nutrients },
    foodGroups: emptyFoodGroupServes(),
    entryCount,
  }
}

describe('scoreTarget', () => {
  it('scores energy with the goal band: met 90 to 110%, close 80 to 120%', () => {
    const energy = entry('energy_kcal')
    expect(scoreTarget(energy, 2925).status).toBe('met') // 0.90
    expect(scoreTarget(energy, 3575).status).toBe('met') // 1.10
    expect(scoreTarget(energy, 2600).status).toBe('close') // 0.80 exactly
    expect(scoreTarget(energy, 3900).status).toBe('close') // 1.20 exactly
    expect(scoreTarget(energy, 2599).status).toBe('short')
    expect(scoreTarget(energy, 3901).status).toBe('over')
    expect(scoreTarget(energy, 2600).ratio).toBeCloseTo(0.8, 10)
  })

  it('never marks protein over; close from 75%, met from 90%', () => {
    const protein = entry('protein_g')
    expect(scoreTarget(protein, 135).status).toBe('met')
    expect(scoreTarget(protein, 300).status).toBe('met')
    expect(scoreTarget(protein, 112.5).status).toBe('close')
    expect(scoreTarget(protein, 134).status).toBe('close')
    expect(scoreTarget(protein, 112).status).toBe('short')
  })

  it('scores carbs and fat with the wider band', () => {
    const carbs = entry('carbs_g') // 460
    expect(scoreTarget(carbs, 368).status).toBe('met') // 0.80
    expect(scoreTarget(carbs, 552).status).toBe('met') // 1.20
    expect(scoreTarget(carbs, 299).status).toBe('close') // 0.65
    expect(scoreTarget(carbs, 621).status).toBe('close') // 1.35
    expect(scoreTarget(carbs, 298).status).toBe('short')
    expect(scoreTarget(carbs, 622).status).toBe('over')
  })

  it('scores water as met from 90% and close from 70%, never over', () => {
    const water = entry('water_ml') // 3250
    expect(scoreTarget(water, 2925).status).toBe('met')
    expect(scoreTarget(water, 5000).status).toBe('met')
    expect(scoreTarget(water, 2275).status).toBe('close')
    expect(scoreTarget(water, 2274).status).toBe('short')
  })

  it('scores minimums: met at or above, close from 75%', () => {
    const fibre = entry('fiber_g') // 45
    expect(scoreTarget(fibre, 45).status).toBe('met')
    expect(scoreTarget(fibre, 60).status).toBe('met')
    expect(scoreTarget(fibre, 33.75).status).toBe('close')
    expect(scoreTarget(fibre, 33).status).toBe('short')
    const vegetables = entry('vegetables') // 6 serves
    expect(scoreTarget(vegetables, 4.5).status).toBe('close')
    expect(scoreTarget(vegetables, 4.4).status).toBe('short')
  })

  it('scores limits: met at or below, close to 115%, over beyond', () => {
    const sodium = entry('sodium_mg') // 2300
    expect(scoreTarget(sodium, 2300).status).toBe('met')
    expect(scoreTarget(sodium, 2645).status).toBe('close')
    expect(scoreTarget(sodium, 2646).status).toBe('over')
    expect(scoreTarget(sodium, 0).status).toBe('met')
  })

  it('scores a zero limit (alcohol) by its over line: none met, some close, two drinks over', () => {
    const alcohol = entry('alcohol_std_drinks') // 0, over above 2
    expect(scoreTarget(alcohol, 0).status).toBe('met')
    expect(scoreTarget(alcohol, 1).status).toBe('close')
    expect(scoreTarget(alcohol, 1).ratio).toBe(0.5)
    expect(scoreTarget(alcohol, 2).status).toBe('over')
    expect(scoreTarget(alcohol, 4).status).toBe('over')
  })

  it('leaves info targets unscored', () => {
    const legumes = entry('legumes')
    const score = scoreTarget(legumes, 0)
    expect(score.status).toBe('unscored')
    expect(score.kind).toBe('info')
  })
})

describe('evaluateDay', () => {
  it('meets the day when energy is close, protein met and no limit over', () => {
    const score = evaluateDay(
      day({ energy_kcal: 2700, protein_g: 185, sodium_mg: 1550, fiber_g: 26 }, 4),
      targets,
    )
    expect(score.logged).toBe(true)
    expect(score.scores.energy_kcal?.status).toBe('close')
    expect(score.scores.protein_g?.status).toBe('met')
    expect(score.dayMet).toBe(true)
  })

  it('fails the day on a limit even when energy and protein are perfect', () => {
    const score = evaluateDay(
      day({ energy_kcal: 3250, protein_g: 150, sodium_mg: 4200 }, 3),
      targets,
    )
    expect(score.scores.sodium_mg?.status).toBe('over')
    expect(score.dayMet).toBe(false)
  })

  it('fails the day when protein is only close', () => {
    const score = evaluateDay(day({ energy_kcal: 3250, protein_g: 130 }, 3), targets)
    expect(score.scores.protein_g?.status).toBe('close')
    expect(score.dayMet).toBe(false)
  })

  it('fails the day on alcohol at two standard drinks', () => {
    const score = evaluateDay(
      day({ energy_kcal: 3250, protein_g: 150, alcohol_std_drinks: 2 }, 3),
      targets,
    )
    expect(score.dayMet).toBe(false)
  })

  it('treats fewer than 2 entries under 40% of energy as unlogged, never met', () => {
    const forgotten = evaluateDay(day({ energy_kcal: 700, protein_g: 45 }, 1), targets)
    expect(forgotten.logged).toBe(false)
    expect(forgotten.dayMet).toBe(false)
    expect(forgotten.entryCount).toBe(1)

    const empty = evaluateDay(day({}, 0), targets)
    expect(empty.logged).toBe(false)

    // One big entry over 40% counts as logged; so do two small ones.
    expect(evaluateDay(day({ energy_kcal: 1400 }, 1), targets).logged).toBe(true)
    expect(evaluateDay(day({ energy_kcal: 300 }, 2), targets).logged).toBe(true)
    // Exactly 40% with one entry is logged (the rule is "under 40%").
    expect(evaluateDay(day({ energy_kcal: 1300 }, 1), targets).logged).toBe(true)
  })

  it('reports completeness as the share of minimum targets met or close', () => {
    // 16 minimums for Finn: fibre, 10 micronutrients, 5 scored food groups.
    const nothing = evaluateDay(day({ energy_kcal: 3000, protein_g: 150 }, 3), targets)
    expect(nothing.completeness).toBe(0)

    const some = evaluateDay(
      {
        totals: {
          ...emptyNutrientVector(),
          energy_kcal: 3000,
          protein_g: 150,
          fiber_g: 45, // met
          iron_mg: 6.5, // 0.81 close
          calcium_mg: 700, // 0.7 short
          vitamin_c_mg: 90, // met
        },
        foodGroups: { ...emptyFoodGroupServes(), fruit: 2 }, // met
        entryCount: 3,
      },
      targets,
    )
    expect(some.completeness).toBe(0.25) // 4 of 16
  })

  it('scores every target in the version, including food groups', () => {
    const score = evaluateDay(
      {
        totals: { ...emptyNutrientVector(), energy_kcal: 3000, protein_g: 150 },
        foodGroups: { ...emptyFoodGroupServes(), vegetables: 3, legumes: 1 },
        entryCount: 3,
      },
      targets,
    )
    expect(Object.keys(score.scores)).toHaveLength(targets.entries.length)
    expect(score.scores.vegetables).toMatchObject({ actual: 3, target: 6, status: 'short' })
    expect(score.scores.legumes?.status).toBe('unscored')
  })
})
