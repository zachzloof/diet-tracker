import { z } from 'zod'
import { addDays } from '../dates.js'
import {
  KCAL_PER_KG_TISSUE,
  PACE_KCAL,
  PACE_KG_PER_WEEK,
  carryOverrides,
  computeTargets,
  targetValue,
  type Overrides,
  type TargetInput,
  type Targets,
} from './targets.js'
import type { ScoredDay } from './week.js'
import { normaliseWeights, weightRate, weightTrend, type WeightPoint } from './weight.js'

/**
 * Recalibration (targets.md section 10, slice 5). Every 14 days, with enough logged days
 * and weigh-ins, compare the weight trend with the pace the plan promised. A gap larger
 * than the tolerance becomes a bounded energy adjustment the person confirms; the engine
 * then applies it as `recalibrationKcal` and re-derives every other target. Pure and
 * deterministic: the API builds the context, this function decides.
 */

export const RECALIBRATION = {
  /** Days a target version must have been in force before the first check. */
  intervalDays: 14,
  /** The window the check looks at, ending today. */
  windowDays: 14,
  minLoggedDays: 10,
  minWeighIns: 4,
  /** First and last weigh-in at least this far apart, or the rate means nothing. */
  minSpanDays: 7,
  /** Actual within this of the expected kg/week counts as on track. */
  toleranceKgPerWeek: 0.15,
  /** The most one recalibration can move energy. */
  maxAdjustmentKcal: 200,
  /** "Not now" hides the proposal for this long. */
  snoozeDays: 14,
} as const

export const RECALIBRATION_STATUSES = [
  'not_due',
  'not_enough_data',
  'unavailable',
  'on_track',
  'proposal',
] as const
export const recalibrationStatusSchema = z.enum(RECALIBRATION_STATUSES)
export type RecalibrationStatus = z.infer<typeof recalibrationStatusSchema>

export const recalibrationEvidenceSchema = z.object({
  windowStart: z.iso.date(),
  windowEnd: z.iso.date(),
  daysLogged: z.number().int().min(0),
  weighIns: z.number().int().min(0),
  /** Days between the first and last weigh-in in the window. */
  spanDays: z.number().int().min(0),
  averageIntakeKcal: z.number().nullable(),
  startTrendKg: z.number().nullable(),
  endTrendKg: z.number().nullable(),
  /** Trend change per week; positive means gaining. Null without enough weigh-ins. */
  actualKgPerWeek: z.number().nullable(),
  expectedKgPerWeek: z.number(),
})
export type RecalibrationEvidence = z.infer<typeof recalibrationEvidenceSchema>

const macroPreviewSchema = z.object({
  energyKcal: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
})
export type MacroPreview = z.infer<typeof macroPreviewSchema>

export const recalibrationProposalSchema = z.object({
  /** Change in the energy target after bounding and the engine's clamps. */
  deltaKcal: z.number(),
  current: macroPreviewSchema,
  proposed: macroPreviewSchema,
  /** The cumulative `recalibrationKcal` the new version will carry. */
  recalibrationKcal: z.number(),
  /** The weight the new version is computed from (the latest weigh-in). */
  weightKg: z.number(),
  /** Engine notes, for example when a clamp limited the change. */
  notes: z.array(z.string()),
})
export type RecalibrationProposal = z.infer<typeof recalibrationProposalSchema>

export const recalibrationAssessmentSchema = z.object({
  status: recalibrationStatusSchema,
  /** One or two plain sentences for the card. */
  reason: z.string(),
  /** When the next check can happen (`not_due`), else null. */
  dueOn: z.iso.date().nullable(),
  snoozedUntil: z.iso.date().nullable(),
  evidence: recalibrationEvidenceSchema,
  proposal: recalibrationProposalSchema.nullable(),
})
export type RecalibrationAssessment = z.infer<typeof recalibrationAssessmentSchema>

export interface RecalibrationContext {
  /** The person's local today. */
  today: string
  /** `effective_from` of the target version in force. */
  effectiveFrom: string
  snoozedUntil: string | null
  /** Fresh engine inputs (today's age, the profile as saved) with the current `recalibrationKcal`. */
  inputs: TargetInput
  overrides: Overrides
  /** The targets in force, with overrides applied. */
  current: Targets
  /** The `windowDays` days ending today, scored, oldest first. */
  days: readonly ScoredDay[]
  /** Weigh-ins inside the window. */
  weights: readonly WeightPoint[]
}

function fmt(value: number, decimals = 0): string {
  return value.toFixed(decimals).replace(/\.0+$/, '')
}

function signed(kg: number): string {
  if (Math.abs(kg) < 0.005) return '0 kg'
  return `${kg > 0 ? '+' : '−'}${Math.abs(kg).toFixed(2)} kg`
}

function preview(targets: Targets): MacroPreview {
  return {
    energyKcal: targetValue(targets, 'energy_kcal'),
    proteinG: targetValue(targets, 'protein_g'),
    carbsG: targetValue(targets, 'carbs_g'),
    fatG: targetValue(targets, 'fat_g'),
  }
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

/** "losing less than planned", "gaining faster than planned", "gaining rather than holding steady". */
function describeGap(expected: number, gap: number): string {
  if (expected < 0) return gap > 0 ? 'losing less than planned' : 'losing faster than planned'
  if (expected > 0) return gap > 0 ? 'gaining faster than planned' : 'gaining less than planned'
  return gap > 0 ? 'gaining rather than holding steady' : 'losing rather than holding steady'
}

export function assessRecalibration(ctx: RecalibrationContext): RecalibrationAssessment {
  const windowEnd = ctx.today
  const windowStart = addDays(windowEnd, -(RECALIBRATION.windowDays - 1))
  const logged = ctx.days.filter(
    (d) => d.score.logged && d.day >= windowStart && d.day <= windowEnd,
  )
  const weights = normaliseWeights(ctx.weights).filter(
    (w) => w.day >= windowStart && w.day <= windowEnd,
  )
  const trend = weightTrend(weights)
  const rate = weightRate(trend, RECALIBRATION.minSpanDays)
  const first = trend[0]
  const last = trend[trend.length - 1]
  const spanDays = rate?.spanDays ?? 0
  const averageIntake =
    logged.length === 0
      ? null
      : Math.round(
          logged.reduce((sum, d) => sum + (d.score.scores.energy_kcal?.actual ?? 0), 0) /
            logged.length,
        )
  const paceApplied = ctx.current.meta.paceApplied
  const expected = paceApplied ? PACE_KG_PER_WEEK[paceApplied] : 0

  const evidence: RecalibrationEvidence = {
    windowStart,
    windowEnd,
    daysLogged: logged.length,
    weighIns: weights.length,
    spanDays,
    averageIntakeKcal: averageIntake,
    startTrendKg: first?.trendKg ?? null,
    endTrendKg: last?.trendKg ?? null,
    actualKgPerWeek: rate?.kgPerWeek ?? null,
    expectedKgPerWeek: expected,
  }
  const base = { dueOn: null, snoozedUntil: ctx.snoozedUntil, evidence, proposal: null }

  if (ctx.current.meta.professionalGuidance) {
    return {
      ...base,
      status: 'unavailable',
      reason:
        'Your targets stay at maintenance because of your health answers, so the app does not adjust them from your weight. Please work with a doctor or dietitian on any change.',
    }
  }
  if (ctx.overrides.energy_kcal !== undefined) {
    return {
      ...base,
      status: 'unavailable',
      reason:
        'Your energy target is set by you, so recalibration leaves it alone. Put energy back to the recommended value on Targets to let the app adjust it from your weight.',
    }
  }

  const dueOn = addDays(ctx.effectiveFrom, RECALIBRATION.intervalDays)
  if (ctx.today < dueOn) {
    return {
      ...base,
      status: 'not_due',
      dueOn,
      reason: `Your targets changed on ${ctx.effectiveFrom}. The first check compares two weeks of weigh-ins and meals against the plan.`,
    }
  }
  if (ctx.snoozedUntil && ctx.today < ctx.snoozedUntil) {
    return {
      ...base,
      status: 'not_due',
      dueOn: ctx.snoozedUntil,
      reason: 'You asked to skip this check for now.',
    }
  }

  const missing: string[] = []
  if (logged.length < RECALIBRATION.minLoggedDays) {
    missing.push(
      `log ${plural(RECALIBRATION.minLoggedDays - logged.length, 'more day')} (${logged.length} of ${RECALIBRATION.minLoggedDays} in the last two weeks)`,
    )
  }
  if (weights.length < RECALIBRATION.minWeighIns) {
    missing.push(
      `weigh in ${plural(RECALIBRATION.minWeighIns - weights.length, 'more time')} (${weights.length} of ${RECALIBRATION.minWeighIns})`,
    )
  } else if (!rate) {
    missing.push(
      `spread your weigh-ins over at least ${RECALIBRATION.minSpanDays} days (${spanDays} so far)`,
    )
  }
  if (missing.length > 0 || !rate || averageIntake === null) {
    const list =
      missing.length === 1
        ? missing[0]!
        : `${missing.slice(0, -1).join(', ')} and ${missing.at(-1)}`
    return {
      ...base,
      status: 'not_enough_data',
      reason: `To check your plan, ${list}. Morning weigh-ins a few times a week are enough.`,
    }
  }

  const actual = rate.kgPerWeek
  const gap = actual - expected
  const summary = `Over the last ${RECALIBRATION.windowDays} days you averaged ${fmt(averageIntake)} kcal a day and your weight trend moved ${signed(actual)} a week against a plan of ${signed(expected)} a week.`
  if (Math.abs(gap) <= RECALIBRATION.toleranceKgPerWeek) {
    return {
      ...base,
      status: 'on_track',
      reason: `${summary} That is on track, so nothing changes.`,
    }
  }

  // Weight moved more (or fell less) than planned: intake is above the true maintenance, so
  // energy comes down, and vice versa. Bounded per round; the engine's clamps still apply.
  const rawDelta = (-gap * KCAL_PER_KG_TISSUE) / 7
  const bounded = Math.max(
    -RECALIBRATION.maxAdjustmentKcal,
    Math.min(RECALIBRATION.maxAdjustmentKcal, Math.round(rawDelta / 10) * 10),
  )
  const latestWeight = weights[weights.length - 1]?.weightKg ?? ctx.inputs.weightKg
  const currentRecal = ctx.inputs.recalibrationKcal ?? 0
  let nextRecal = currentRecal + bounded
  let inputs: TargetInput = {
    ...ctx.inputs,
    weightKg: Math.round(latestWeight * 10) / 10,
    recalibrationKcal: nextRecal,
  }
  let computed = computeTargets(inputs)
  // When a clamp or the floor bound, store only the part that took effect so the next round
  // starts from the real target rather than from an adjustment that never applied.
  const paceKcal = computed.meta.paceApplied ? PACE_KCAL[computed.meta.paceApplied] : 0
  const applied = computed.meta.energyAdjustmentKcal - paceKcal
  if (applied !== nextRecal) {
    nextRecal = applied
    inputs = { ...inputs, recalibrationKcal: nextRecal }
    computed = computeTargets(inputs)
  }
  const overrides = carryOverrides(computed, ctx.overrides)
  const effective = computeTargets(inputs, overrides)
  const current = preview(ctx.current)
  const proposed = preview(effective)
  const deltaKcal = proposed.energyKcal - current.energyKcal

  if (deltaKcal === 0) {
    return {
      ...base,
      status: 'unavailable',
      reason: `${summary} The plan is already at the safe limit, so the app will not move energy further. A ${gap > 0 ? 'gentler' : 'faster'} pace or a chat with a dietitian would be the next step.`,
    }
  }
  return {
    ...base,
    status: 'proposal',
    reason: `${summary} You are ${describeGap(expected, gap)}, so eating ${fmt(Math.abs(deltaKcal))} kcal ${deltaKcal < 0 ? 'less' : 'more'} a day should bring you back in line.`,
    proposal: {
      deltaKcal,
      current,
      proposed,
      recalibrationKcal: nextRecal,
      weightKg: inputs.weightKg,
      notes: computed.meta.notes.filter((note) => note.startsWith('Energy was')),
    },
  }
}
