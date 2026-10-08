import { describe, expect, it } from 'vitest'
import { NO_FLAGS } from '../profile.js'
import { emptyFoodGroupServes, emptyNutrientVector, type NutrientVector } from './nutrients.js'
import {
  WATER_CAUTION_ML,
  dayMetRule,
  evaluateDay,
  scoreTarget,
  type DayTotals,
} from './scoring.js'
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
  it('scores energy with the goal band: met 95 to 105%, close 90 to 110% (D34)', () => {
    const energy = entry('energy_kcal') // 3250
    expect(scoreTarget(energy, 3087.5).status).toBe('met') // 0.95 exactly
    expect(scoreTarget(energy, 3412.5).status).toBe('met') // 1.05 exactly
    expect(scoreTarget(energy, 3087).status).toBe('close')
    expect(scoreTarget(energy, 3413).status).toBe('close')
    expect(scoreTarget(energy, 2925).status).toBe('close') // 0.90 exactly
    expect(scoreTarget(energy, 3575).status).toBe('close') // 1.10 exactly
    expect(scoreTarget(energy, 2924).status).toBe('short')
    expect(scoreTarget(energy, 3576).status).toBe('over')
    expect(scoreTarget(energy, 2925).ratio).toBeCloseTo(0.9, 10)
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

  it('scores water as met from 95%, close from 90%, never over', () => {
    const water = entry('water_ml') // 3250
    expect(scoreTarget(water, 3100).status).toBe('met') // 0.954
    expect(scoreTarget(water, 3087.5).status).toBe('met') // 0.95 exactly
    expect(scoreTarget(water, 3087).status).toBe('close')
    expect(scoreTarget(water, 2925).status).toBe('close') // 0.90
    expect(scoreTarget(water, 2924).status).toBe('short')
    expect(scoreTarget(water, 5000).status).toBe('met')
    expect(scoreTarget(water, 9000).status).toBe('met') // the UI cautions above WATER_CAUTION_ML
    expect(WATER_CAUTION_ML).toBe(4000)
  })

  it('scores minimums: met from 95%, close from 90%', () => {
    const fibre = entry('fiber_g') // 45
    expect(scoreTarget(fibre, 45).status).toBe('met')
    expect(scoreTarget(fibre, 60).status).toBe('met')
    expect(scoreTarget(fibre, 42.75).status).toBe('met') // 0.95 exactly
    expect(scoreTarget(fibre, 42).status).toBe('close')
    expect(scoreTarget(fibre, 40.5).status).toBe('close') // 0.90 exactly
    expect(scoreTarget(fibre, 40).status).toBe('short')
    const vegetables = entry('vegetables') // 6 serves
    expect(scoreTarget(vegetables, 5.7).status).toBe('met')
    expect(scoreTarget(vegetables, 5.4).status).toBe('close')
    expect(scoreTarget(vegetables, 5.3).status).toBe('short')
    // The omega-3 report: 1.55 g shows as "1.6 / 1.6" and must read met, not close.
    expect(scoreTarget(entry('omega3_g'), 1.55).status).toBe('met')
  })

  it('flags a micronutrient over at its tolerable upper intake level', () => {
    const vitaminC = entry('vitamin_c_mg') // RDA 90, UL 2000
    expect(vitaminC.overAbove).toBe(2000)
    expect(scoreTarget(vitaminC, 500).status).toBe('met')
    expect(scoreTarget(vitaminC, 1999).status).toBe('met')
    expect(scoreTarget(vitaminC, 2000).status).toBe('over')
    const calcium = entry('calcium_mg') // UL 2500 under 51
    expect(scoreTarget(calcium, 2600).status).toBe('over')
    // No UL from food: never over, however much.
    const potassium = entry('potassium_mg')
    expect(potassium.overAbove).toBeNull()
    expect(scoreTarget(potassium, 20000).status).toBe('met')
    expect(scoreTarget(entry('magnesium_mg'), 900).status).toBe('met')
  })

  it('scores limits: met to 105%, close to 110%, over beyond', () => {
    const sodium = entry('sodium_mg') // 2300
    expect(scoreTarget(sodium, 2300).status).toBe('met')
    expect(scoreTarget(sodium, 2415).status).toBe('met') // 1.05 exactly
    expect(scoreTarget(sodium, 2416).status).toBe('close')
    expect(scoreTarget(sodium, 2530).status).toBe('close') // 1.10 exactly
    expect(scoreTarget(sodium, 2531).status).toBe('over')
    expect(scoreTarget(sodium, 0).status).toBe('met')
  })

  it('gives alcohol no target and no score (hidden, D34)', () => {
    expect(targetFor(targets, 'alcohol_std_drinks')).toBeUndefined()
    // A stored version from before D34 still carries the entry: it scores as unscored.
    const legacy = {
      ...entry('sodium_mg'),
      key: 'alcohol_std_drinks' as const,
      value: 0,
      overAbove: 2,
    }
    expect(scoreTarget(legacy, 3).status).toBe('unscored')
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
      day({ energy_kcal: 3000, protein_g: 185, sodium_mg: 1550, fiber_g: 26 }, 4),
      targets,
    )
    expect(score.logged).toBe(true)
    expect(score.scores.energy_kcal?.status).toBe('close')
    expect(score.scores.protein_g?.status).toBe('met')
    expect(score.dayMet).toBe(true)
  })

  it('gain: a limit over is shown but never fails the day (D31)', () => {
    const score = evaluateDay(
      day({ energy_kcal: 3250, protein_g: 150, sodium_mg: 4200, saturated_fat_g: 60 }, 3),
      targets,
    )
    expect(score.scores.sodium_mg?.status).toBe('over')
    expect(score.scores.saturated_fat_g?.status).toBe('over')
    expect(score.dayMet).toBe(true)
    expect(dayMetRule('gain').decidingLimits).toEqual([])
    expect(dayMetRule('recomp').decidingLimits).toEqual([])
  })

  it('recomp: same rule as gain', () => {
    const recomp = computeTargets({ ...finn, goal: 'recomp', pace: null })
    expect(recomp.meta.goalApplied).toBe('recomp')
    const energy = targetFor(recomp, 'energy_kcal')?.value ?? 0
    const score = evaluateDay(
      day({ energy_kcal: energy, protein_g: 200, sodium_mg: 4200, alcohol_std_drinks: 3 }),
      recomp,
    )
    expect(score.scores.energy_kcal?.status).toBe('met')
    expect(score.dayMet).toBe(true)
  })

  it('lose: only added sugar can fail the day; sodium, saturated fat and alcohol cannot', () => {
    const lose = computeTargets({ ...finn, goal: 'lose', pace: null })
    expect(lose.meta.goalApplied).toBe('lose')
    const energy = targetFor(lose, 'energy_kcal')?.value ?? 0
    const sugarLimit = targetFor(lose, 'added_sugar_g')?.value ?? 0
    const base = { energy_kcal: energy, protein_g: 200 }
    expect(
      evaluateDay(
        day({ ...base, sodium_mg: 5000, saturated_fat_g: 80, alcohol_std_drinks: 3 }),
        lose,
      ).dayMet,
    ).toBe(true)
    const sugary = evaluateDay(day({ ...base, added_sugar_g: sugarLimit * 1.3 }), lose)
    expect(sugary.scores.added_sugar_g?.status).toBe('over')
    expect(sugary.dayMet).toBe(false)
    // Within the 10% close band is still met.
    expect(evaluateDay(day({ ...base, added_sugar_g: sugarLimit * 1.1 }), lose).dayMet).toBe(true)
    expect(evaluateDay(day({ ...base, added_sugar_g: sugarLimit * 1.11 }), lose).dayMet).toBe(false)
  })

  it('maintain: every limit decides the day, and close protein is enough', () => {
    const maintain = computeTargets({ ...finn, goal: 'maintain', pace: null })
    const energy = targetFor(maintain, 'energy_kcal')?.value ?? 0
    const proteinTarget = targetFor(maintain, 'protein_g')?.value ?? 0
    const closeProtein = evaluateDay(
      day({ energy_kcal: energy, protein_g: proteinTarget * 0.8 }),
      maintain,
    )
    expect(closeProtein.scores.protein_g?.status).toBe('close')
    expect(closeProtein.dayMet).toBe(true)
    expect(
      evaluateDay(day({ energy_kcal: energy, protein_g: proteinTarget * 0.7 }), maintain).dayMet,
    ).toBe(false)
    for (const over of [{ sodium_mg: 4200 }, { saturated_fat_g: 80 }, { added_sugar_g: 150 }]) {
      expect(
        evaluateDay(day({ energy_kcal: energy, protein_g: proteinTarget, ...over }), maintain)
          .dayMet,
      ).toBe(false)
    }
  })

  it('fails the day when protein is only close', () => {
    const score = evaluateDay(day({ energy_kcal: 3250, protein_g: 130 }, 3), targets)
    expect(score.scores.protein_g?.status).toBe('close')
    expect(score.dayMet).toBe(false)
  })

  it('maintain: alcohol never decides the day and is not in the rule', () => {
    const maintain = computeTargets({ ...finn, goal: 'maintain', pace: null })
    const energy = targetFor(maintain, 'energy_kcal')?.value ?? 0
    const score = evaluateDay(
      day({ energy_kcal: energy, protein_g: 200, alcohol_std_drinks: 6 }, 3),
      maintain,
    )
    expect(score.scores.alcohol_std_drinks).toBeUndefined()
    expect(score.dayMet).toBe(true)
    expect(dayMetRule('maintain').decidingLimits).not.toContain('alcohol_std_drinks')
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
    // 20 minimums for Finn: fibre, 14 nutrients with a DRI (minerals, vitamins, omega-3), 5 scored food groups.
    const nothing = evaluateDay(day({ energy_kcal: 3000, protein_g: 150 }, 3), targets)
    expect(nothing.completeness).toBe(0)

    const some = evaluateDay(
      {
        totals: {
          ...emptyNutrientVector(),
          energy_kcal: 3000,
          protein_g: 150,
          fiber_g: 45, // met
          iron_mg: 7.4, // 0.925 close
          calcium_mg: 700, // 0.7 short
          vitamin_c_mg: 90, // met
        },
        foodGroups: { ...emptyFoodGroupServes(), fruit: 2 }, // met
        entryCount: 3,
      },
      targets,
    )
    expect(some.completeness).toBe(0.2) // 4 of 20
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
