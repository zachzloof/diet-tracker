import { z } from 'zod'
import { ACTIVITY_LABELS, GOAL_LABELS, PACE_LABELS, TRAINING_TYPE_LABELS } from '../labels.js'
import {
  ACTIVITY_LEVELS,
  DEFAULT_PACE,
  MIN_AGE,
  PACES_BY_GOAL,
  activitySchema,
  dietPatternSchema,
  goalSchema,
  paceSchema,
  safetyFlagsSchema,
  sexSchema,
  trainingTypeSchema,
  type Activity,
  type Goal,
  type Pace,
  type Sex,
  type TrainingType,
} from '../profile.js'
import { MICRO_KEYS, SODIUM_LIMIT_MG, ageBand, driFor, foodGroupServesFor } from './dri.js'
import {
  FOOD_GROUPS,
  FOOD_GROUP_KEYS,
  NUTRIENTS,
  NUTRIENT_UNITS,
  TARGET_KINDS,
  foodGroupKeySchema,
  nutrientKeySchema,
  type FoodGroupKey,
  type NutrientKey,
} from './nutrients.js'

/**
 * `computeTargets`: onboarding answers in, daily targets out. Pure and deterministic; the
 * formulas, defaults and worked examples are in
 * `.claude/skills/nutrition-engine/references/targets.md`, and the golden tests in
 * `targets.test.ts` pin Finn and Tess to those numbers exactly.
 *
 * Overrides are "pins": a pinned value replaces the formula for that key and everything
 * downstream (carbs as the remainder, limits as a share of energy) follows it, so a person
 * who sets energy to 3000 kcal gets macros that still add up.
 */

export const ENGINE_VERSION = 1

export const targetInputSchema = z.object({
  sex: sexSchema,
  age: z.number().int().min(0).max(130),
  heightCm: z.number().positive(),
  weightKg: z.number().positive(),
  bodyFatPct: z.number().nullable(),
  activity: activitySchema,
  trainingType: trainingTypeSchema,
  trainingDaysPerWeek: z.number().int().min(0).max(7),
  goal: goalSchema,
  pace: paceSchema.nullable(),
  goalWeightKg: z.number().nullable(),
  dietPattern: dietPatternSchema,
  flags: safetyFlagsSchema,
})
export type TargetInput = z.infer<typeof targetInputSchema>

export const targetKeySchema = z.enum([...nutrientKeySchema.options, ...foodGroupKeySchema.options])
export type TargetKey = z.infer<typeof targetKeySchema>

export const TARGET_UNITS = [...NUTRIENT_UNITS, 'serves'] as const
export const targetUnitSchema = z.enum(TARGET_UNITS)
export type TargetUnit = z.infer<typeof targetUnitSchema>

export const targetEntrySchema = z.object({
  key: targetKeySchema,
  kind: z.enum(TARGET_KINDS),
  value: z.number().min(0),
  unit: targetUnitSchema,
  /** Overrides inside the range are accepted silently; outside it with a warning. */
  range: z.object({ min: z.number().min(0), max: z.number().min(0) }).nullable(),
  /** Overrides below the floor are refused unless explicitly confirmed. */
  floor: z.number().min(0).nullable(),
  /** For limits whose target is 0 (alcohol): the amount that counts as "over". */
  overAbove: z.number().min(0).nullable(),
  reason: z.string(),
  overridden: z.boolean(),
})
export type TargetEntry = z.infer<typeof targetEntrySchema>

export const targetsMetaSchema = z.object({
  engineVersion: z.number().int(),
  formula: z.enum(['mifflin_st_jeor', 'katch_mcardle']),
  bmr: z.number(),
  pal: z.number(),
  tdee: z.number(),
  goalApplied: goalSchema,
  paceApplied: paceSchema.nullable(),
  energyAdjustmentKcal: z.number(),
  floorKcal: z.number(),
  referenceWeightKg: z.number(),
  proteinGPerKg: z.number(),
  fatPercent: z.number(),
  waterRestDayMl: z.number(),
  professionalGuidance: z.boolean(),
  notes: z.array(z.string()),
})
export type TargetsMeta = z.infer<typeof targetsMetaSchema>

export const targetsSchema = z.object({
  entries: z.array(targetEntrySchema),
  meta: targetsMetaSchema,
})
export type Targets = z.infer<typeof targetsSchema>

export const MAX_OVERRIDE_VALUE = 100_000
export const overridesSchema = z.partialRecord(
  targetKeySchema,
  z.number().min(0).max(MAX_OVERRIDE_VALUE),
)
export type Overrides = z.infer<typeof overridesSchema>

// --- Constants from targets.md -------------------------------------------------------------

export const PAL: Readonly<Record<Activity, number>> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
  very_high: 1.9,
}

export const KCAL_PER_KG_TISSUE = 7700

export const PACE_KG_PER_WEEK: Readonly<Record<Pace, number>> = {
  gentle: -0.25,
  standard: -0.5,
  aggressive: -0.75,
  lean: 0.25,
  fast: 0.5,
}

/** kcal/day for each pace: kg/week × 7700 / 7. */
export const PACE_KCAL: Readonly<Record<Pace, number>> = {
  gentle: -275,
  standard: -550,
  aggressive: -825,
  lean: 275,
  fast: 550,
}

const SEX_FLOOR_KCAL: Readonly<Record<Sex, number>> = {
  male: 1500,
  female: 1200,
  unspecified: 1350,
}
const MAX_DEFICIT_SHARE = 0.25
const MAX_SURPLUS_SHARE = 0.2

const PROTEIN_G_PER_KG: Readonly<Record<Goal, { default: number; min: number; max: number }>> = {
  lose: { default: 2.0, min: 1.8, max: 2.4 },
  maintain: { default: 1.6, min: 1.4, max: 1.8 },
  gain: { default: 1.8, min: 1.6, max: 2.2 },
  recomp: { default: 2.2, min: 2.0, max: 2.4 },
}
const HIGH_PROTEIN_TRAINING: readonly TrainingType[] = ['combat', 'strength', 'crossfit']
const GOAL_PHRASE: Readonly<Record<Goal, string>> = {
  lose: 'fat loss',
  maintain: 'maintenance',
  gain: 'a lean gain',
  recomp: 'recomposition',
}
const HIGH_PROTEIN_DAYS = 5
const OLDER_ADULT_AGE = 60
const OLDER_ADULT_MIN_G_PER_KG = 1.2
const PROTEIN_RDA_G_PER_KG = 0.8
const PROTEIN_MAX_ENERGY_SHARE = 0.35

const FAT_FLOOR_G_PER_KG = 0.5
const FAT_SHARE = {
  default: { pct: 0.25, min: 0.2, max: 0.35 },
  low_carb: { pct: 0.4, min: 0.35, max: 0.5 },
} as const

const CARBS_MIN_G = { default: 50, low_carb: 30 } as const
const CARBS_TRAINING_G_PER_KG = 3

const FIBRE = { perThousandKcal: 14, min: 25, max: 45 } as const
const ADDED_SUGAR_ENERGY_SHARE = 0.1
const SATURATED_FAT_ENERGY_SHARE = 0.1
const WATER = { mlPerKg: 35, perTrainingHourMl: 500, maxMl: 5000, stepMl: 250 } as const
const ALCOHOL_OVER_ABOVE = 2

const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const

// --- Helpers ----------------------------------------------------------------------------

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step
}

function fmt(value: number, decimals = 0): string {
  return value.toFixed(decimals).replace(/\.0+$/, '')
}

/** Which activity level the stated training days imply, for the mismatch note. */
function impliedActivityIndex(trainingDaysPerWeek: number): number {
  if (trainingDaysPerWeek <= 1) return 0
  if (trainingDaysPerWeek <= 3) return 1
  if (trainingDaysPerWeek <= 5) return 2
  return 3
}

function driLabel(sex: Sex, age: number): string {
  const band = ageBand(age).replace('-', ' to ')
  const who = sex === 'male' ? 'men' : sex === 'female' ? 'women' : 'adults'
  return `${who} aged ${band}`
}

// --- The engine -------------------------------------------------------------------------

export function computeTargets(input: TargetInput, overrides: Overrides = {}): Targets {
  const notes: string[] = []
  const { weightKg: kg, heightCm, age, sex } = input
  const lowCarb = input.dietPattern === 'low_carb'
  const pin = (key: TargetKey): number | undefined => overrides[key]

  // 1. Safety flags come before everything.
  const flagged = input.flags.pregnant || input.flags.breastfeeding || input.flags.edHistory
  const underage = age < MIN_AGE
  let goal: Goal = input.goal
  let pace: Pace | null = input.pace
  if ((flagged || underage) && goal !== 'maintain') {
    notes.push(
      flagged
        ? 'Targets are set to maintenance because of your health answers. Please work with a doctor or dietitian before changing your intake.'
        : 'Targets are set to maintenance because the app is designed for adults.',
    )
    goal = 'maintain'
  }
  const allowedPaces = PACES_BY_GOAL[goal]
  if (allowedPaces.length === 0) pace = null
  else if (pace === null || !allowedPaces.includes(pace)) pace = DEFAULT_PACE[goal]

  // 2. BMR and TDEE.
  let bmr: number
  let formula: TargetsMeta['formula']
  if (input.bodyFatPct !== null) {
    const leanKg = kg * (1 - input.bodyFatPct / 100)
    bmr = 370 + 21.6 * leanKg
    formula = 'katch_mcardle'
  } else {
    const base = 10 * kg + 6.25 * heightCm - 5 * age
    bmr = sex === 'male' ? base + 5 : sex === 'female' ? base - 161 : base - 78
    formula = 'mifflin_st_jeor'
  }
  const pal = PAL[input.activity]
  const tdee = bmr * pal
  const activityIndex = ACTIVITY_LEVELS.indexOf(input.activity)
  if (Math.abs(activityIndex - impliedActivityIndex(input.trainingDaysPerWeek)) >= 2) {
    notes.push(
      `An activity level of "${ACTIVITY_LABELS[input.activity].label}" is unusual for ${input.trainingDaysPerWeek} training days a week. Review it if the energy target feels off.`,
    )
  }

  // 3. Energy: pace adjustment, then clamps, then the floor.
  const paceKcal = pace ? PACE_KCAL[pace] : 0
  let energyRaw = tdee + paceKcal
  const floorKcal = Math.max(bmr, SEX_FLOOR_KCAL[sex])
  const energyNotes: string[] = []
  if (goal === 'lose' && energyRaw < tdee * (1 - MAX_DEFICIT_SHARE)) {
    energyRaw = tdee * (1 - MAX_DEFICIT_SHARE)
    energyNotes.push('capped at a 25% deficit; a gentler pace would fit better')
  }
  if (goal === 'gain' && energyRaw > tdee * (1 + MAX_SURPLUS_SHARE)) {
    energyRaw = tdee * (1 + MAX_SURPLUS_SHARE)
    energyNotes.push('capped at a 20% surplus')
  }
  if (energyRaw < floorKcal) {
    energyRaw = floorKcal
    energyNotes.push(
      `raised to the safe floor of ${fmt(roundTo(floorKcal, 10))} kcal; choose a gentler pace`,
    )
  }
  const energyComputed = roundTo(energyRaw, 10)
  const energy = pin('energy_kcal') ?? energyComputed
  /** The pace adjustment actually applied, after clamps and the floor. */
  const energyAdjustment = Math.round(energyRaw - tdee)

  const formulaName =
    formula === 'katch_mcardle' ? 'Katch-McArdle from body fat' : 'Mifflin-St Jeor'
  const tdeeText = `${fmt(roundTo(tdee, 10))} kcal to maintain (${fmt(Math.round(bmr))} kcal basal by ${formulaName}, times ${pal} for ${ACTIVITY_LABELS[input.activity].label.toLowerCase()} activity)`
  let energyReason: string
  if (pace) {
    const sign = paceKcal > 0 ? 'plus' : 'minus'
    energyReason = `${tdeeText}, ${sign} ${fmt(Math.abs(paceKcal))} kcal a day for a ${PACE_LABELS[pace].label.toLowerCase()} pace of about ${fmt(Math.abs(PACE_KG_PER_WEEK[pace]), 2)} kg a week (7700 kcal per kg).`
  } else {
    energyReason = `${tdeeText}. ${GOAL_LABELS[goal].label} means eating at maintenance.`
  }
  if (energyNotes.length > 0) energyReason += ` Then ${energyNotes.join('; ')}.`
  for (const note of energyNotes) notes.push(`Energy was ${note}.`)

  // 4. Protein by g/kg of reference weight.
  const heightM = heightCm / 100
  const bmi = kg / (heightM * heightM)
  let referenceWeight = kg
  let referenceNote = ''
  if (bmi >= 30) {
    const idealKg = 22 * heightM * heightM
    referenceWeight = input.goalWeightKg ?? idealKg + 0.4 * (kg - idealKg)
    referenceNote = ` (a reference weight of ${fmt(referenceWeight)} kg, since BMI is over 30)`
  }
  const band = PROTEIN_G_PER_KG[goal]
  let gPerKg = band.default
  let gPerKgMin = band.min
  const gPerKgMax = band.max
  const highTraining =
    HIGH_PROTEIN_TRAINING.includes(input.trainingType) ||
    input.trainingDaysPerWeek >= HIGH_PROTEIN_DAYS
  let proteinWhy = `for ${GOAL_PHRASE[goal]}`
  if (highTraining) {
    const bumped = Math.min(gPerKg + 0.2, gPerKgMax)
    const bump = bumped - gPerKg
    gPerKg = bumped
    if (bump > 0) {
      proteinWhy += HIGH_PROTEIN_TRAINING.includes(input.trainingType)
        ? `, plus ${bump.toFixed(1)} g/kg for ${TRAINING_TYPE_LABELS[input.trainingType].toLowerCase()}`
        : `, plus ${bump.toFixed(1)} g/kg for training ${input.trainingDaysPerWeek} days a week`
    }
  }
  if (age >= OLDER_ADULT_AGE) {
    gPerKg = Math.max(gPerKg, OLDER_ADULT_MIN_G_PER_KG)
    gPerKgMin = Math.max(gPerKgMin, OLDER_ADULT_MIN_G_PER_KG)
  }
  let proteinComputed = roundTo(gPerKg * referenceWeight, 5)
  let proteinReason = `${gPerKg.toFixed(1)} g/kg × ${fmt(referenceWeight)} kg${referenceNote} ${proteinWhy}.`
  if (proteinComputed * KCAL_PER_G.protein > PROTEIN_MAX_ENERGY_SHARE * energy) {
    proteinComputed = Math.floor((PROTEIN_MAX_ENERGY_SHARE * energy) / KCAL_PER_G.protein / 5) * 5
    gPerKg = proteinComputed / referenceWeight
    proteinReason += ` Lowered to ${gPerKg.toFixed(1)} g/kg so protein stays under 35% of energy.`
    notes.push('Protein was lowered to keep it under 35% of energy.')
  }
  const protein = pin('protein_g') ?? proteinComputed
  const proteinFloor = roundTo(
    Math.max(PROTEIN_RDA_G_PER_KG, age >= OLDER_ADULT_AGE ? OLDER_ADULT_MIN_G_PER_KG : 0) *
      referenceWeight,
    5,
  )
  const proteinRange = {
    min: roundTo(gPerKgMin * referenceWeight, 5),
    max: roundTo(gPerKgMax * referenceWeight, 5),
  }

  // 5. Fat as a share of energy with a g/kg floor.
  const share = lowCarb ? FAT_SHARE.low_carb : FAT_SHARE.default
  const fatFloorG = FAT_FLOOR_G_PER_KG * kg
  const fatFromShare = (share.pct * energy) / KCAL_PER_G.fat
  const fatFloorBinds = fatFromShare < fatFloorG
  let fatComputed = roundTo(Math.max(fatFromShare, fatFloorG), 5)
  let fatReason = fatFloorBinds
    ? `Raised to the floor of 0.5 g/kg (${fmt(fatFloorG)} g) for hormonal health; ${fmt(share.pct * 100)}% of energy would be lower.`
    : `${fmt(share.pct * 100)}% of energy${lowCarb ? ' for a low-carb pattern' : ''}, above the 0.5 g/kg floor of ${fmt(fatFloorG)} g.`
  let fat = pin('fat_g') ?? fatComputed

  // 6. Carbohydrates as the remainder, with the training check and the minimum.
  const carbsMin = lowCarb ? CARBS_MIN_G.low_carb : CARBS_MIN_G.default
  const remainder = () =>
    roundTo((energy - protein * KCAL_PER_G.protein - fat * KCAL_PER_G.fat) / KCAL_PER_G.carbs, 5)
  let carbs = remainder()
  let carbsReason = `What is left after protein and fat: about ${fmt(carbs / kg, 1)} g/kg.`
  const trainingNeedsCarbs =
    input.trainingDaysPerWeek >= HIGH_PROTEIN_DAYS && carbs < CARBS_TRAINING_G_PER_KG * kg
  if (trainingNeedsCarbs && pin('fat_g') === undefined && pin('carbs_g') === undefined) {
    const fatMinG = Math.max((share.min * energy) / KCAL_PER_G.fat, fatFloorG)
    const shortfallKcal = (CARBS_TRAINING_G_PER_KG * kg - carbs) * KCAL_PER_G.carbs
    const reducible = Math.max(0, fat - Math.ceil(fatMinG / 5) * 5)
    const reduceG = Math.min(shortfallKcal / KCAL_PER_G.fat, reducible)
    if (reduceG > 0) {
      fat = roundTo(fat - reduceG, 5)
      fatComputed = fat
      fatReason += ` Lowered toward ${fmt(share.min * 100)}% to leave room for carbs on ${input.trainingDaysPerWeek} training days.`
      carbs = remainder()
      carbsReason = `What is left after protein and fat, with fat trimmed to make room: about ${fmt(carbs / kg, 1)} g/kg.`
    }
    if (carbs < CARBS_TRAINING_G_PER_KG * kg) {
      notes.push('Carbs are on the low side for your training volume; consider a gentler pace.')
    }
  }
  if (carbs < carbsMin) {
    carbs = carbsMin
    carbsReason = `Raised to the ${carbsMin} g minimum.`
    notes.push(
      `Carbs were raised to the ${carbsMin} g minimum, so the macros add up to more than the energy target.`,
    )
  }
  if (pin('carbs_g') !== undefined) carbs = pin('carbs_g') ?? carbs
  const macroKcal = protein * KCAL_PER_G.protein + carbs * KCAL_PER_G.carbs + fat * KCAL_PER_G.fat
  if (Math.abs(macroKcal - energy) > 0.05 * energy) {
    notes.push(
      `Your macros add up to about ${fmt(roundTo(macroKcal, 10))} kcal against an energy target of ${fmt(energy)} kcal. Energy is the number that counts.`,
    )
  }
  const fatRange = {
    min: roundTo(Math.max((share.min * energy) / KCAL_PER_G.fat, fatFloorG), 5),
    max: roundTo((share.max * energy) / KCAL_PER_G.fat, 5),
  }
  const carbsRange = {
    min: carbsMin,
    max: Math.max(
      carbsMin,
      roundTo(
        (energy - protein * KCAL_PER_G.protein - fatFloorG * KCAL_PER_G.fat) / KCAL_PER_G.carbs,
        5,
      ),
    ),
  }

  // 7. Fibre, sugars, saturated fat, sodium, water, alcohol.
  const fibre = Math.round(
    Math.min(FIBRE.max, Math.max((FIBRE.perThousandKcal * energy) / 1000, FIBRE.min)),
  )
  const addedSugar = Math.round((ADDED_SUGAR_ENERGY_SHARE * energy) / KCAL_PER_G.carbs)
  const saturatedFat = Math.round((SATURATED_FAT_ENERGY_SHARE * energy) / KCAL_PER_G.fat)
  const waterTraining = Math.min(
    WATER.maxMl,
    roundTo(WATER.mlPerKg * kg + WATER.perTrainingHourMl, WATER.stepMl),
  )
  const waterRest = Math.min(WATER.maxMl, roundTo(WATER.mlPerKg * kg, WATER.stepMl))

  const energyRange = {
    min: roundTo(tdee * (flagged ? 0.9 : 1 - MAX_DEFICIT_SHARE), 10),
    max: roundTo(tdee * (1 + MAX_SURPLUS_SHARE), 10),
  }

  const entries: TargetEntry[] = []
  const add = (
    key: TargetKey,
    value: number,
    reason: string,
    extra: Partial<Pick<TargetEntry, 'range' | 'floor' | 'overAbove' | 'kind'>> = {},
  ) => {
    const meta = key in NUTRIENTS ? NUTRIENTS[key as NutrientKey] : FOOD_GROUPS[key as FoodGroupKey]
    const unit: TargetUnit = 'unit' in meta ? meta.unit : 'serves'
    entries.push({
      key,
      kind: extra.kind ?? meta.kind,
      value,
      unit,
      range: extra.range ?? null,
      floor: extra.floor ?? null,
      overAbove: extra.overAbove ?? null,
      reason,
      overridden: false,
    })
  }

  add('energy_kcal', energy, energyReason, { range: energyRange, floor: roundTo(floorKcal, 10) })
  add('protein_g', protein, proteinReason, { range: proteinRange, floor: proteinFloor })
  add('carbs_g', carbs, carbsReason, { range: carbsRange, floor: carbsMin })
  add('fat_g', fat, fatReason, { range: fatRange, floor: roundTo(fatFloorG, 5) })
  add(
    'fiber_g',
    fibre,
    `${FIBRE.perThousandKcal} g per 1000 kcal, at least ${FIBRE.min} g and at most ${FIBRE.max} g.`,
    { range: { min: 20, max: FIBRE.max }, floor: 10 },
  )
  add('added_sugar_g', addedSugar, 'Under 10% of energy, the WHO limit for added sugars.', {
    range: { min: 0, max: addedSugar },
  })
  add('saturated_fat_g', saturatedFat, 'Under 10% of energy.', {
    range: { min: 0, max: saturatedFat },
  })
  add(
    'sodium_mg',
    SODIUM_LIMIT_MG,
    `${SODIUM_LIMIT_MG} mg upper limit. Heavy sweaters may need more on hard training days.`,
    { range: { min: 1500, max: SODIUM_LIMIT_MG } },
  )
  add(
    'water_ml',
    waterTraining,
    `${WATER.mlPerKg} ml per kg plus ${WATER.perTrainingHourMl} ml per training hour: ${fmt(waterTraining)} ml on training days, ${fmt(waterRest)} ml on rest days.`,
    { range: { min: 1500, max: WATER.maxMl }, floor: 1000 },
  )
  add(
    'alcohol_std_drinks',
    0,
    `Zero is the target. ${ALCOHOL_OVER_ABOVE} standard drinks (10 g of alcohol each) in a day counts as over.`,
    { range: { min: 0, max: ALCOHOL_OVER_ABOVE }, overAbove: ALCOHOL_OVER_ABOVE },
  )

  // 8. Micronutrients by sex and age band.
  const who = driLabel(sex, age)
  for (const key of MICRO_KEYS) {
    const value = driFor(key, sex, age)
    const basis = key === 'potassium_mg' ? 'Adequate intake' : 'RDA'
    const unspecified = sex === 'unspecified' ? ' (the higher of the two sex-specific values)' : ''
    const vegan =
      key === 'vitamin_b12_ug' && input.dietPattern === 'vegan'
        ? ' On a vegan diet this comes from fortified foods or a supplement.'
        : ''
    add(key, value, `${basis} for ${who}${unspecified}.${vegan}`, {
      range: { min: roundMicro(value * 0.8), max: roundMicro(value * 2) },
    })
  }

  // 9. Food-group serves.
  for (const key of FOOD_GROUP_KEYS) {
    const value = foodGroupServesFor(key, sex, age, input.dietPattern)
    const serve = FOOD_GROUPS[key].serveDefinition
    if (value === null) {
      const suggested =
        key === 'legumes' && (input.dietPattern === 'vegan' || input.dietPattern === 'vegetarian')
          ? 'A daily serve is a good anchor for protein and iron on a plant-based diet. '
          : ''
      add(key, 1, `${suggested}Shown for information, not scored. One serve is ${serve}.`, {
        range: { min: 0, max: 5 },
      })
      continue
    }
    const why =
      key === 'whole_grains' && lowCarb
        ? 'Lowered for a low-carb pattern.'
        : `Australian Dietary Guidelines for ${who}.`
    add(key, value, `${why} One serve is ${serve}.`, {
      range: { min: roundMicro(value * 0.5), max: roundMicro(value * 2) },
    })
  }

  // 10. Mark pins. Energy, protein, fat and carbs were applied inline; the rest apply here.
  for (const entry of entries) {
    const pinned = pin(entry.key)
    if (pinned === undefined) continue
    const computedValue = entry.value
    const inline =
      entry.key === 'energy_kcal' ||
      entry.key === 'protein_g' ||
      entry.key === 'fat_g' ||
      entry.key === 'carbs_g'
    if (!inline) entry.value = pinned
    entry.overridden = true
    const recommended = inline
      ? recommendedFor(entry.key, { energyComputed, proteinComputed, fatComputed, carbs })
      : computedValue
    entry.reason = `Set by you. Recommended: ${fmt(recommended, 1)} ${entry.unit === 'serves' ? 'serves' : NUTRIENTS[entry.key as NutrientKey].unitLabel}. ${entry.reason}`
  }

  return {
    entries,
    meta: {
      engineVersion: ENGINE_VERSION,
      formula,
      bmr: round2(bmr),
      pal,
      tdee: round2(tdee),
      goalApplied: goal,
      paceApplied: pace,
      energyAdjustmentKcal: energyAdjustment,
      floorKcal: roundTo(floorKcal, 10),
      referenceWeightKg: round2(referenceWeight),
      proteinGPerKg: round2(gPerKg),
      fatPercent: share.pct,
      waterRestDayMl: waterRest,
      professionalGuidance: flagged,
      notes,
    },
  }
}

function recommendedFor(
  key: TargetKey,
  computed: { energyComputed: number; proteinComputed: number; fatComputed: number; carbs: number },
): number {
  switch (key) {
    case 'energy_kcal':
      return computed.energyComputed
    case 'protein_g':
      return computed.proteinComputed
    case 'fat_g':
      return computed.fatComputed
    default:
      return computed.carbs
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** Micronutrient ranges keep one decimal (B12 is 2.4 mcg). */
function roundMicro(value: number): number {
  return Math.round(value * 10) / 10
}

// --- Lookups and overrides ----------------------------------------------------------------

export function targetFor(targets: Targets, key: TargetKey): TargetEntry | undefined {
  return targets.entries.find((entry) => entry.key === key)
}

export function targetValue(targets: Targets, key: TargetKey): number {
  return targetFor(targets, key)?.value ?? 0
}

export type OverrideLevel = 'ok' | 'warning' | 'blocked'

export interface OverrideCheck {
  key: TargetKey
  level: OverrideLevel
  message: string | null
}

function unitLabelFor(entry: TargetEntry): string {
  return entry.unit === 'serves' ? 'serves' : NUTRIENTS[entry.key as NutrientKey].unitLabel
}

/**
 * Rule 3 of the nutrition-engine skill: inside the range is silent, outside it is a warning,
 * below the safety floor is refused unless the person explicitly confirms. `entry` is the
 * computed (un-pinned) target so the check does not drift with previous overrides.
 */
export function checkOverride(entry: TargetEntry, value: number): OverrideCheck {
  const unit = unitLabelFor(entry)
  if (entry.floor !== null && value < entry.floor) {
    return {
      key: entry.key,
      level: 'blocked',
      message: `${fmt(value, 1)} ${unit} is below the safe minimum of ${fmt(entry.floor, 1)} ${unit}. Going lower is not recommended without professional guidance.`,
    }
  }
  if (entry.range && (value < entry.range.min || value > entry.range.max)) {
    const direction = value < entry.range.min ? 'below' : 'above'
    return {
      key: entry.key,
      level: 'warning',
      message: `${fmt(value, 1)} ${unit} is ${direction} the usual range of ${fmt(entry.range.min, 1)} to ${fmt(entry.range.max, 1)} ${unit}.`,
    }
  }
  return { key: entry.key, level: 'ok', message: null }
}

/** Drops overrides that no longer exist as targets or that the new computed targets would block. */
export function carryOverrides(computed: Targets, overrides: Overrides): Overrides {
  const kept: Overrides = {}
  for (const [rawKey, value] of Object.entries(overrides)) {
    const key = targetKeySchema.safeParse(rawKey)
    if (!key.success || typeof value !== 'number') continue
    const entry = targetFor(computed, key.data)
    if (!entry) continue
    if (checkOverride(entry, value).level === 'blocked') continue
    kept[key.data] = value
  }
  return kept
}
