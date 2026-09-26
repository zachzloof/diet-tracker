import { z } from 'zod'
import { MICRO_KEYS } from './dri.js'
import { suggestionsFor, type SuggestionKey, type SuggestionProfile } from './gap-suggestions.js'
import { FOOD_GROUPS, NUTRIENTS, type FoodGroupKey, type NutrientKey } from './nutrients.js'
import type { DayScore, TargetScore } from './scoring.js'
import { targetKeySchema, type TargetKey } from './targets.js'

/**
 * `findGaps`: the rules behind "areas where you're lacking" (nutrients.md section 5),
 * over the last seven calendar days using only logged days. Pure and deterministic; the
 * evidence strings are what the weekly review quotes.
 *
 * | rule | triggers when | severity |
 * | energy_off_plan | average energy ratio outside 0.85 to 1.15 | high |
 * | protein_short | protein short or close on 3+ logged days | high |
 * | limit_over | a limit over on 3+ logged days | medium |
 * | fibre_short | fibre below 0.75 on 4+ logged days | medium |
 * | food_group_short | a scored food group below 0.60 on 4+ logged days | medium |
 * | micro_short | a micronutrient below 0.70 on 5+ logged days | low |
 * | water_short | water below 0.70 on 4+ logged days | low |
 * | logging_gaps | 3+ unlogged days | low |
 *
 * Ranking: severity, then how far off (distance of the average ratio from 1), then key.
 */

export const GAP_RULES = [
  'not_enough_days',
  'energy_off_plan',
  'protein_short',
  'limit_over',
  'fibre_short',
  'food_group_short',
  'micro_short',
  'water_short',
  'logging_gaps',
] as const
export const gapRuleSchema = z.enum(GAP_RULES)
export type GapRule = z.infer<typeof gapRuleSchema>

export const GAP_SEVERITIES = ['high', 'medium', 'low'] as const
export const gapSeveritySchema = z.enum(GAP_SEVERITIES)
export type GapSeverity = z.infer<typeof gapSeveritySchema>

export const gapSchema = z.object({
  rule: gapRuleSchema,
  /** The target the rule fired on, or null for the logging rules. */
  key: targetKeySchema.nullable(),
  severity: gapSeveritySchema,
  direction: z.enum(['under', 'over']).nullable(),
  /**
   * Average actual / target: over logged days for "under" rules, over the affected days
   * for `limit_over` (so it says how far over, not how often).
   */
  averageRatio: z.number().min(0).nullable(),
  daysAffected: z.number().int().min(0),
  daysLogged: z.number().int().min(0),
  title: z.string(),
  evidence: z.string(),
  suggestions: z.array(z.string()),
})
export type Gap = z.infer<typeof gapSchema>

export const MIN_DAYS_FOR_GAPS = 4
export const MAX_GAPS_SHOWN = 5

const ENERGY_BAND = { min: 0.85, max: 1.15 } as const
const PROTEIN_DAYS = 3
const LIMIT_DAYS = 3
const FIBRE_RATIO = 0.75
const FIBRE_DAYS = 4
const FOOD_GROUP_RATIO = 0.6
const FOOD_GROUP_DAYS = 4
const MICRO_RATIO = 0.7
const MICRO_DAYS = 5
const WATER_RATIO = 0.7
const WATER_DAYS = 4
const UNLOGGED_DAYS = 3

const LIMIT_KEYS: readonly NutrientKey[] = [
  'sodium_mg',
  'saturated_fat_g',
  'added_sugar_g',
  'alcohol_std_drinks',
]
const SCORED_FOOD_GROUPS: readonly FoodGroupKey[] = [
  'vegetables',
  'fruit',
  'whole_grains',
  'dairy_or_alt',
  'protein_foods',
]

const SEVERITY_RANK: Readonly<Record<GapSeverity, number>> = { high: 0, medium: 1, low: 2 }
const EPS = 1e-9

export type GapProfile = SuggestionProfile

function labelFor(key: TargetKey): string {
  return key in NUTRIENTS
    ? NUTRIENTS[key as NutrientKey].label
    : FOOD_GROUPS[key as FoodGroupKey].label
}

function unitFor(key: TargetKey): string {
  return key in NUTRIENTS ? NUTRIENTS[key as NutrientKey].unitLabel : 'serves'
}

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
}

function fmt(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function scoresOf(days: readonly DayScore[], key: TargetKey): TargetScore[] {
  return days.flatMap((day) => {
    const score = day.scores[key]
    return score ? [score] : []
  })
}

function ratiosOf(scores: readonly TargetScore[]): number[] {
  return scores.flatMap((score) => (score.ratio === null ? [] : [score.ratio]))
}

/** "3 of 6 logged days" reads better than "3/6". */
function daysText(affected: number, logged: number): string {
  return `${affected} of ${logged} logged day${logged === 1 ? '' : 's'}`
}

export function findGaps(days: readonly DayScore[], profile: GapProfile): Gap[] {
  const logged = days.filter((day) => day.logged)
  const unlogged = days.length - logged.length
  const n = logged.length

  if (n < MIN_DAYS_FOR_GAPS) {
    return [
      {
        rule: 'not_enough_days',
        key: null,
        severity: 'low',
        direction: null,
        averageRatio: null,
        daysAffected: unlogged,
        daysLogged: n,
        title: 'Log a few more days',
        evidence: `${n === 0 ? 'None' : `Only ${n}`} of the last ${days.length} days ${n === 1 ? 'was' : 'were'} logged. Log at least ${MIN_DAYS_FOR_GAPS} to see where you are lacking.`,
        suggestions: suggestionsFor('logging', profile),
      },
    ]
  }

  const gaps: Gap[] = []
  const push = (
    rule: GapRule,
    key: TargetKey | null,
    severity: GapSeverity,
    direction: 'under' | 'over' | null,
    averageRatio: number | null,
    daysAffected: number,
    title: string,
    evidence: string,
    suggestionKey: SuggestionKey,
  ) => {
    gaps.push({
      rule,
      key,
      severity,
      direction,
      averageRatio,
      daysAffected,
      daysLogged: n,
      title,
      evidence,
      suggestions: suggestionsFor(suggestionKey, profile),
    })
  }

  // Energy: the average over logged days, not a day count, because one big day is not a pattern.
  const energyRatios = ratiosOf(scoresOf(logged, 'energy_kcal'))
  const energyAvg = mean(energyRatios)
  if (
    energyAvg !== null &&
    (energyAvg < ENERGY_BAND.min - EPS || energyAvg > ENERGY_BAND.max + EPS)
  ) {
    const under = energyAvg < ENERGY_BAND.min
    const affected = energyRatios.filter((r) =>
      under ? r < ENERGY_BAND.min - EPS : r > ENERGY_BAND.max + EPS,
    ).length
    push(
      'energy_off_plan',
      'energy_kcal',
      'high',
      under ? 'under' : 'over',
      energyAvg,
      affected,
      under ? 'Energy under plan' : 'Energy over plan',
      `Energy averaged ${pct(energyAvg)} of target over ${n} logged days${under ? ', below the 85% line' : ', above the 115% line'}.`,
      under ? 'energy_under' : 'energy_over',
    )
  }

  // Protein: short or close on 3+ days.
  const protein = scoresOf(logged, 'protein_g')
  const proteinDays = protein.filter((s) => s.status === 'short' || s.status === 'close').length
  if (proteinDays >= PROTEIN_DAYS) {
    const avg = mean(ratiosOf(protein))
    push(
      'protein_short',
      'protein_g',
      'high',
      'under',
      avg,
      proteinDays,
      'Protein short',
      `Protein was short or close on ${daysText(proteinDays, n)}${avg === null ? '' : ` (average ${pct(avg)} of target)`}.`,
      'protein_g',
    )
  }

  // Limits: over on 3+ days. The average is over the days it was over.
  for (const key of LIMIT_KEYS) {
    const scores = scoresOf(logged, key)
    const over = scores.filter((s) => s.status === 'over')
    if (over.length < LIMIT_DAYS) continue
    const avg = mean(ratiosOf(over))
    const label = labelFor(key)
    push(
      'limit_over',
      key,
      'medium',
      'over',
      avg,
      over.length,
      `${label} over the limit`,
      `${label} was over the limit on ${daysText(over.length, n)}${avg === null ? '' : `, averaging ${pct(avg)} of the limit on those days`}.`,
      key,
    )
  }

  // Fibre: below 75% on 4+ days.
  const fibre = scoresOf(logged, 'fiber_g')
  const fibreDays = fibre.filter((s) => s.ratio !== null && s.ratio < FIBRE_RATIO - EPS).length
  if (fibreDays >= FIBRE_DAYS) {
    const avg = mean(ratiosOf(fibre))
    const avgActual = mean(fibre.map((s) => s.actual))
    const target = fibre[0]?.target ?? 0
    push(
      'fibre_short',
      'fiber_g',
      'medium',
      'under',
      avg,
      fibreDays,
      'Fibre short',
      `Fibre was under 75% of target on ${daysText(fibreDays, n)}${avgActual === null ? '' : ` (average ${fmt(avgActual)} of ${fmt(target)} g)`}.`,
      'fiber_g',
    )
  }

  // Food groups: below 60% on 4+ days.
  for (const key of SCORED_FOOD_GROUPS) {
    const scores = scoresOf(logged, key)
    const short = scores.filter((s) => s.ratio !== null && s.ratio < FOOD_GROUP_RATIO - EPS).length
    if (short < FOOD_GROUP_DAYS) continue
    const avg = mean(ratiosOf(scores))
    const avgActual = mean(scores.map((s) => s.actual))
    const target = scores[0]?.target ?? 0
    const label = labelFor(key)
    push(
      'food_group_short',
      key,
      'medium',
      'under',
      avg,
      short,
      `Not enough ${label.toLowerCase()}`,
      `${label} ${key === 'vegetables' || key === 'whole_grains' || key === 'protein_foods' ? 'were' : 'was'} under 60% of target on ${daysText(short, n)}${avgActual === null ? '' : ` (average ${fmt(avgActual)} of ${fmt(target)} serves)`}.`,
      key,
    )
  }

  // Micronutrients: below 70% on 5+ days. Weighted lightly because AI estimates of them are rough.
  for (const key of MICRO_KEYS) {
    const scores = scoresOf(logged, key)
    const short = scores.filter((s) => s.ratio !== null && s.ratio < MICRO_RATIO - EPS).length
    if (short < MICRO_DAYS) continue
    const avg = mean(ratiosOf(scores))
    const avgActual = mean(scores.map((s) => s.actual))
    const target = scores[0]?.target ?? 0
    const label = labelFor(key)
    push(
      'micro_short',
      key,
      'low',
      'under',
      avg,
      short,
      `${label} low`,
      `${label} was under 70% of target on ${daysText(short, n)}${avgActual === null ? '' : ` (average ${fmt(avgActual)} of ${fmt(target)} ${unitFor(key)})`}.`,
      key,
    )
  }

  // Water: below 70% on 4+ days.
  const water = scoresOf(logged, 'water_ml')
  const waterDays = water.filter((s) => s.ratio !== null && s.ratio < WATER_RATIO - EPS).length
  if (waterDays >= WATER_DAYS) {
    const avg = mean(ratiosOf(water))
    push(
      'water_short',
      'water_ml',
      'low',
      'under',
      avg,
      waterDays,
      'Water low',
      `Water was under 70% of target on ${daysText(waterDays, n)}${avg === null ? '' : ` (average ${pct(avg)})`}.`,
      'water_ml',
    )
  }

  // Logging gaps: 3+ unlogged days in the window.
  if (unlogged >= UNLOGGED_DAYS) {
    push(
      'logging_gaps',
      null,
      'low',
      null,
      null,
      unlogged,
      'Gaps in logging',
      `${unlogged} of the last ${days.length} days had nothing logged.`,
      'logging',
    )
  }

  return gaps.sort(compareGaps)
}

function distance(gap: Gap): number {
  return gap.averageRatio === null ? 0 : Math.abs(1 - gap.averageRatio)
}

function compareGaps(a: Gap, b: Gap): number {
  const severity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
  if (severity !== 0) return severity
  const off = distance(b) - distance(a)
  if (Math.abs(off) > EPS) return off
  const ak = a.key ?? a.rule
  const bk = b.key ?? b.rule
  return ak < bk ? -1 : ak > bk ? 1 : 0
}
