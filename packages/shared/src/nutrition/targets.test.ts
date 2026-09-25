import { describe, expect, it } from 'vitest'
import { NO_FLAGS } from '../profile.js'
import {
  carryOverrides,
  checkOverride,
  computeTargets,
  targetFor,
  targetValue,
  type TargetInput,
  type TargetKey,
  type Targets,
} from './targets.js'

/** The two personas from docs/PLAN.md and targets.md section 11. */
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
  goalWeightKg: null,
  dietPattern: 'omnivore',
  flags: NO_FLAGS,
}

function values(targets: Targets): Partial<Record<TargetKey, number>> {
  const out: Partial<Record<TargetKey, number>> = {}
  for (const entry of targets.entries) out[entry.key] = entry.value
  return out
}

function entry(targets: Targets, key: TargetKey) {
  const found = targetFor(targets, key)
  if (!found) throw new Error(`no target for ${key}`)
  return found
}

describe('computeTargets golden: Finn', () => {
  const targets = computeTargets(finn)

  it('matches the worked example exactly', () => {
    expect(targets.meta.formula).toBe('mifflin_st_jeor')
    expect(targets.meta.bmr).toBe(1727.5)
    expect(targets.meta.tdee).toBeCloseTo(2979.94, 2)
    expect(values(targets)).toMatchObject({
      energy_kcal: 3250,
      protein_g: 150,
      fat_g: 90,
      carbs_g: 460,
      fiber_g: 45,
      added_sugar_g: 81,
      saturated_fat_g: 36,
      sodium_mg: 2300,
      water_ml: 3250,
      alcohol_std_drinks: 0,
      iron_mg: 8,
      calcium_mg: 1000,
      magnesium_mg: 400,
      zinc_mg: 11,
      potassium_mg: 3400,
      vitamin_a_ug: 900,
      vitamin_c_mg: 90,
      vitamin_d_ug: 15,
      vitamin_b12_ug: 2.4,
      folate_ug: 400,
      vegetables: 6,
      fruit: 2,
      whole_grains: 6,
      protein_foods: 3,
      dairy_or_alt: 2.5,
    })
    expect(targets.meta.waterRestDayMl).toBe(2750)
    expect(targets.meta.proteinGPerKg).toBe(2)
    expect(targets.meta.referenceWeightKg).toBe(75)
    expect(targets.meta.professionalGuidance).toBe(false)
  })

  it('carries a reason with the actual numbers on every entry', () => {
    for (const target of targets.entries) expect(target.reason.length).toBeGreaterThan(10)
    expect(entry(targets, 'energy_kcal').reason).toMatch(/2980 kcal to maintain/)
    expect(entry(targets, 'energy_kcal').reason).toMatch(/plus 275 kcal/)
    expect(entry(targets, 'protein_g').reason).toMatch(/2\.0 g\/kg × 75 kg/)
    expect(entry(targets, 'protein_g').reason).toMatch(/plus 0\.2 g\/kg for combat sports/)
    expect(entry(targets, 'water_ml').reason).toMatch(
      /3250 ml on training days, 2750 ml on rest days/,
    )
  })

  it('has override ranges and floors from the rules', () => {
    const energy = entry(targets, 'energy_kcal')
    expect(energy.floor).toBe(1730)
    expect(energy.range).toEqual({ min: 2230, max: 3580 })
    const protein = entry(targets, 'protein_g')
    expect(protein.range).toEqual({ min: 120, max: 165 })
    expect(protein.floor).toBe(60)
    expect(entry(targets, 'fat_g').floor).toBe(40)
    expect(entry(targets, 'carbs_g').floor).toBe(50)
    expect(entry(targets, 'alcohol_std_drinks').overAbove).toBe(2)
  })

  it('uses the right kinds', () => {
    expect(entry(targets, 'energy_kcal').kind).toBe('goal')
    expect(entry(targets, 'fiber_g').kind).toBe('minimum')
    expect(entry(targets, 'sodium_mg').kind).toBe('limit')
    expect(entry(targets, 'legumes').kind).toBe('info')
    expect(targetFor(targets, 'sugar_g')).toBeUndefined()
  })
})

describe('computeTargets golden: Tess', () => {
  const targets = computeTargets(tess)

  it('matches the worked example exactly', () => {
    expect(targets.meta.bmr).toBe(1189)
    expect(targets.meta.tdee).toBeCloseTo(1842.95, 2)
    expect(values(targets)).toMatchObject({
      energy_kcal: 1570,
      protein_g: 100,
      fat_g: 45,
      carbs_g: 190,
      fiber_g: 25,
      added_sugar_g: 39,
      saturated_fat_g: 17,
      sodium_mg: 2300,
      water_ml: 2250,
      iron_mg: 18,
      calcium_mg: 1000,
      magnesium_mg: 310,
      zinc_mg: 8,
      potassium_mg: 2600,
      vitamin_a_ug: 700,
      vitamin_c_mg: 75,
      vitamin_d_ug: 15,
      vitamin_b12_ug: 2.4,
      folate_ug: 400,
      vegetables: 5,
      fruit: 2,
      whole_grains: 4,
      protein_foods: 2.5,
      dairy_or_alt: 2.5,
    })
    expect(targets.meta.waterRestDayMl).toBe(1750)
    expect(targets.meta.floorKcal).toBe(1200)
    expect(entry(targets, 'energy_kcal').reason).toMatch(/minus 275 kcal/)
    expect(targets.meta.notes).toEqual([])
  })
})

describe('computeTargets edge cases', () => {
  it('caps an aggressive deficit at 25% of TDEE and says so', () => {
    const targets = computeTargets({ ...tess, pace: 'aggressive' })
    // 1842.95 - 825 = 1018 would breach the 25% clamp (1382.2), so energy stops there.
    expect(targetValue(targets, 'energy_kcal')).toBe(1380)
    expect(entry(targets, 'energy_kcal').reason).toMatch(/capped at a 25% deficit/)
    expect(targets.meta.notes.join(' ')).toMatch(/25% deficit/)
  })

  it('never goes below the sex floor and suggests a gentler pace', () => {
    const small: TargetInput = {
      ...tess,
      age: 40,
      heightCm: 150,
      weightKg: 45,
      activity: 'sedentary',
      trainingType: 'none',
      trainingDaysPerWeek: 0,
      pace: 'standard',
    }
    const targets = computeTargets(small)
    // BMR 1026.5, TDEE 1231.8; even the 25% clamp (923.9) sits under the 1200 floor.
    expect(targetValue(targets, 'energy_kcal')).toBe(1200)
    expect(entry(targets, 'energy_kcal').reason).toMatch(/safe floor of 1200 kcal/)
    expect(targets.meta.floorKcal).toBe(1200)
  })

  it('uses an adjusted reference weight for protein when BMI is 30 or more', () => {
    const heavy: TargetInput = {
      ...finn,
      heightCm: 180,
      weightKg: 110,
      activity: 'light',
      trainingType: 'none',
      trainingDaysPerWeek: 2,
      goal: 'lose',
      pace: 'standard',
    }
    const targets = computeTargets(heavy)
    // ideal 22 * 1.8^2 = 71.28; reference = 71.28 + 0.4 * (110 - 71.28) = 86.77
    expect(targets.meta.referenceWeightKg).toBeCloseTo(86.77, 2)
    expect(targetValue(targets, 'protein_g')).toBe(175)
    expect(entry(targets, 'protein_g').reason).toMatch(/reference weight of 87 kg/)

    const withGoal = computeTargets({ ...heavy, goalWeightKg: 90 })
    expect(withGoal.meta.referenceWeightKg).toBe(90)
    expect(targetValue(withGoal, 'protein_g')).toBe(180)
  })

  it('keeps protein at or above 1.2 g/kg for older adults', () => {
    const older: TargetInput = {
      ...tess,
      age: 65,
      goal: 'maintain',
      pace: null,
      weightKg: 60,
      trainingType: 'none',
      trainingDaysPerWeek: 1,
      activity: 'light',
    }
    const targets = computeTargets(older)
    expect(targetValue(targets, 'protein_g')).toBeGreaterThanOrEqual(1.2 * 60)
    expect(entry(targets, 'protein_g').floor).toBe(70)
    expect(targetValue(targets, 'calcium_mg')).toBe(1200)
    expect(targetValue(targets, 'iron_mg')).toBe(8)
    expect(targetValue(targets, 'dairy_or_alt')).toBe(3.5)
  })

  it('gives a low-carb pattern 40% fat, a 30 g carb minimum and fewer whole grains', () => {
    const targets = computeTargets({ ...finn, dietPattern: 'low_carb' })
    expect(targets.meta.fatPercent).toBe(0.4)
    expect(targetValue(targets, 'fat_g')).toBe(145) // 0.4 * 3250 / 9 = 144.4
    expect(entry(targets, 'carbs_g').floor).toBe(30)
    expect(targetValue(targets, 'whole_grains')).toBe(3)
    expect(entry(targets, 'fat_g').reason).toMatch(/40% of energy/)
  })

  it('forces maintenance and a professional-guidance note for a pregnancy flag', () => {
    const targets = computeTargets({ ...tess, flags: { ...NO_FLAGS, pregnant: true } })
    expect(targets.meta.goalApplied).toBe('maintain')
    expect(targets.meta.paceApplied).toBeNull()
    expect(targets.meta.professionalGuidance).toBe(true)
    expect(targetValue(targets, 'energy_kcal')).toBe(1840)
    expect(targets.meta.notes[0]).toMatch(/work with a doctor or dietitian/)
    expect(targetValue(targets, 'protein_g')).toBe(80) // maintain 1.6 g/kg
  })

  it('uses Katch-McArdle when body fat is given and names it', () => {
    const targets = computeTargets({ ...finn, bodyFatPct: 12 })
    // lean 66 kg -> 370 + 21.6 * 66 = 1795.6
    expect(targets.meta.formula).toBe('katch_mcardle')
    expect(targets.meta.bmr).toBe(1795.6)
    expect(entry(targets, 'energy_kcal').reason).toMatch(/Katch-McArdle/)
  })

  it('raises fat to the 0.5 g/kg floor when the share is too low', () => {
    // BMR 1589 is the floor, so energy is 1590: 25% / 9 = 44 g, under 0.5 * 100 = 50 g.
    const heavyCut: TargetInput = {
      ...tess,
      age: 50,
      weightKg: 100,
      activity: 'sedentary',
      trainingType: 'none',
      trainingDaysPerWeek: 0,
      pace: 'standard',
    }
    const targets = computeTargets(heavyCut)
    expect(targetValue(targets, 'energy_kcal')).toBe(1590)
    expect(targetValue(targets, 'fat_g')).toBe(50)
    expect(entry(targets, 'fat_g').reason).toMatch(/floor of 0\.5 g\/kg/)
  })

  it('trims fat toward 20% to lift carbs for a high-volume trainer', () => {
    const cutter: TargetInput = {
      ...finn,
      goal: 'lose',
      pace: 'aggressive',
      weightKg: 90,
      heightCm: 175,
    }
    const targets = computeTargets(cutter)
    const fat = entry(targets, 'fat_g')
    const carbs = targetValue(targets, 'carbs_g')
    const energy = targetValue(targets, 'energy_kcal')
    expect(fat.value).toBeLessThan(Math.round((0.25 * energy) / 9 / 5) * 5)
    expect(fat.reason).toMatch(/leave room for carbs/)
    expect(carbs).toBeGreaterThan(0)
  })

  it('rounds energy to 10, macros to 5, water to 250', () => {
    const targets = computeTargets({ ...finn, weightKg: 77.3, heightCm: 181 })
    expect(targetValue(targets, 'energy_kcal') % 10).toBe(0)
    expect(targetValue(targets, 'protein_g') % 5).toBe(0)
    expect(targetValue(targets, 'fat_g') % 5).toBe(0)
    expect(targetValue(targets, 'carbs_g') % 5).toBe(0)
    expect(targetValue(targets, 'water_ml') % 250).toBe(0)
  })

  it('notes an activity level that disagrees with training days by two levels', () => {
    const targets = computeTargets({ ...finn, activity: 'sedentary' })
    expect(targets.meta.notes.join(' ')).toMatch(/unusual for 6 training days/)
  })

  it('takes the higher DRI and the male serves for an unspecified sex', () => {
    const targets = computeTargets({ ...tess, sex: 'unspecified' })
    expect(targetValue(targets, 'iron_mg')).toBe(18)
    expect(targetValue(targets, 'potassium_mg')).toBe(3400)
    expect(targetValue(targets, 'vegetables')).toBe(6)
    expect(targets.meta.floorKcal).toBe(1350)
  })

  it('is deterministic', () => {
    expect(computeTargets(finn)).toEqual(computeTargets(finn))
  })
})

describe('overrides as pins', () => {
  const computed = computeTargets(finn)

  it('pins protein and recomputes carbs as the remainder', () => {
    const effective = computeTargets(finn, { protein_g: 180 })
    expect(targetValue(effective, 'protein_g')).toBe(180)
    expect(entry(effective, 'protein_g').overridden).toBe(true)
    expect(entry(effective, 'protein_g').reason).toMatch(/^Set by you\. Recommended: 150 g\./)
    // (3250 - 720 - 810) / 4 = 430
    expect(targetValue(effective, 'carbs_g')).toBe(430)
    expect(entry(effective, 'carbs_g').overridden).toBe(false)
  })

  it('pins energy and lets fat, carbs, fibre and the limits follow', () => {
    const effective = computeTargets(finn, { energy_kcal: 3000 })
    expect(targetValue(effective, 'energy_kcal')).toBe(3000)
    expect(targetValue(effective, 'fat_g')).toBe(85) // 0.25 * 3000 / 9 = 83.3
    expect(targetValue(effective, 'carbs_g')).toBe(410) // (3000 - 600 - 765) / 4 = 408.75
    expect(targetValue(effective, 'added_sugar_g')).toBe(75)
    expect(targetValue(effective, 'saturated_fat_g')).toBe(33)
    expect(targetValue(effective, 'fiber_g')).toBe(42)
  })

  it('pins a micronutrient or food group directly', () => {
    const effective = computeTargets(finn, { vegetables: 8, calcium_mg: 1300 })
    expect(targetValue(effective, 'vegetables')).toBe(8)
    expect(targetValue(effective, 'calcium_mg')).toBe(1300)
    expect(entry(effective, 'vegetables').reason).toMatch(/Recommended: 6 serves/)
  })

  it('notes when pinned carbs stop the macros adding up', () => {
    const effective = computeTargets(finn, { carbs_g: 600 })
    expect(effective.meta.notes.join(' ')).toMatch(/macros add up to about 3810 kcal/)
  })

  it('checkOverride: inside the range is ok, outside warns, below the floor blocks', () => {
    expect(checkOverride(entry(computed, 'protein_g'), 160).level).toBe('ok')
    const high = checkOverride(entry(computed, 'protein_g'), 180)
    expect(high.level).toBe('warning')
    expect(high.message).toMatch(/above the usual range of 120 to 165 g/)
    const low = checkOverride(entry(computed, 'energy_kcal'), 1500)
    expect(low.level).toBe('blocked')
    expect(low.message).toMatch(/below the safe minimum of 1730 kcal/)
    expect(checkOverride(entry(computed, 'energy_kcal'), 3000).level).toBe('ok')
    expect(checkOverride(entry(computed, 'sodium_mg'), 3000).level).toBe('warning')
  })

  it('carryOverrides drops blocked and unknown keys and keeps the rest', () => {
    const kept = carryOverrides(computed, { protein_g: 180, energy_kcal: 1500, vegetables: 7 })
    expect(kept).toEqual({ protein_g: 180, vegetables: 7 })
  })
})
