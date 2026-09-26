import { z } from 'zod'
import {
  TARGET_KINDS,
  type FoodGroupKey,
  type FoodGroupServes,
  type NutrientKey,
  type NutrientVector,
} from './nutrients.js'
import { targetKeySchema, type TargetEntry, type TargetKey, type Targets } from './targets.js'

/**
 * `evaluateDay`: one day's totals against its targets (nutrition-engine skill, nutrients.md
 * section 4). Pure; the API runs it for weekly stats and the browser runs it for the live
 * Today screen, so the two can never disagree.
 *
 * Per-target status from actual / target:
 * - goal (energy): met 0.90 to 1.10, close 0.80 to 1.20, else short or over
 * - goal (protein): met >= 0.90, close 0.75 to 0.90, else short; never over
 * - goal (carbs, fat): met 0.80 to 1.20, close 0.65 to 1.35, else short or over
 * - goal (water): met >= 0.90, close 0.70 to 0.90, else short
 * - minimum: met >= 1.00, close 0.75 to 1.00, else short
 * - limit: met <= 1.00, close 1.00 to 1.15, else over
 * - info: not scored
 */

export const TARGET_STATUSES = ['met', 'close', 'short', 'over', 'unscored'] as const
export const targetStatusSchema = z.enum(TARGET_STATUSES)
export type TargetStatus = z.infer<typeof targetStatusSchema>

export const targetScoreSchema = z.object({
  key: targetKeySchema,
  kind: z.enum(TARGET_KINDS),
  actual: z.number().min(0),
  target: z.number().min(0),
  /** actual / target, or null when the target is 0 and nothing defines "over". */
  ratio: z.number().min(0).nullable(),
  status: targetStatusSchema,
})
export type TargetScore = z.infer<typeof targetScoreSchema>

export const dayScoreSchema = z.object({
  /** False for a forgotten day: fewer than 2 entries and under 40% of the energy target. */
  logged: z.boolean(),
  /** Energy met or close, protein met, no limit over. Always false when unlogged. */
  dayMet: z.boolean(),
  /** Share of `minimum` targets (fibre, micronutrients, food groups) met or close. */
  completeness: z.number().min(0).max(1),
  entryCount: z.number().int().min(0),
  scores: z.partialRecord(targetKeySchema, targetScoreSchema),
})
export type DayScore = z.infer<typeof dayScoreSchema>

export interface DayTotals {
  totals: NutrientVector
  foodGroups: FoodGroupServes
  /** Food entries logged that day (water quick-adds do not count). */
  entryCount: number
}

/** A day with fewer entries than this AND under `UNLOGGED_ENERGY_RATIO` of energy is unlogged. */
export const UNLOGGED_MAX_ENTRIES = 2
export const UNLOGGED_ENERGY_RATIO = 0.4

/** Boundary values (a day at exactly 80% of energy) land inside the band, not outside it. */
const EPS = 1e-9

interface Band {
  metMin: number
  metMax: number
  closeMin: number
  closeMax: number
}

const BANDS: Readonly<Record<'energy' | 'protein' | 'macro' | 'water', Band>> = {
  energy: { metMin: 0.9, metMax: 1.1, closeMin: 0.8, closeMax: 1.2 },
  protein: { metMin: 0.9, metMax: Infinity, closeMin: 0.75, closeMax: Infinity },
  macro: { metMin: 0.8, metMax: 1.2, closeMin: 0.65, closeMax: 1.35 },
  water: { metMin: 0.9, metMax: Infinity, closeMin: 0.7, closeMax: Infinity },
}
const MINIMUM_CLOSE = 0.75
const LIMIT_CLOSE = 1.15

function goalBand(key: TargetKey): Band {
  switch (key) {
    case 'energy_kcal':
      return BANDS.energy
    case 'protein_g':
      return BANDS.protein
    case 'water_ml':
      return BANDS.water
    default:
      return BANDS.macro
  }
}

function inBand(ratio: number, min: number, max: number): boolean {
  return ratio >= min - EPS && ratio <= max + EPS
}

function goalStatus(key: TargetKey, ratio: number): TargetStatus {
  const band = goalBand(key)
  if (inBand(ratio, band.metMin, band.metMax)) return 'met'
  if (inBand(ratio, band.closeMin, band.closeMax)) return 'close'
  return ratio < band.closeMin ? 'short' : 'over'
}

function minimumStatus(ratio: number): TargetStatus {
  if (ratio >= 1 - EPS) return 'met'
  if (ratio >= MINIMUM_CLOSE - EPS) return 'close'
  return 'short'
}

function limitStatus(ratio: number): TargetStatus {
  if (ratio <= 1 + EPS) return 'met'
  if (ratio <= LIMIT_CLOSE + EPS) return 'close'
  return 'over'
}

/** One target scored. Exported so the UI can score a single value (a live bar) the same way. */
export function scoreTarget(entry: TargetEntry, actual: number): TargetScore {
  const target = entry.value
  const base = { key: entry.key, kind: entry.kind, actual, target }
  if (entry.kind === 'info') {
    return { ...base, ratio: target > 0 ? actual / target : null, status: 'unscored' }
  }
  if (entry.kind === 'limit') {
    if (target > 0) {
      const ratio = actual / target
      return { ...base, ratio, status: limitStatus(ratio) }
    }
    // A zero limit (alcohol): `overAbove` says what counts as over; anything above zero is close.
    if (entry.overAbove !== null && entry.overAbove > 0) {
      const ratio = actual / entry.overAbove
      const status: TargetStatus = actual <= 0 ? 'met' : ratio < 1 - EPS ? 'close' : 'over'
      return { ...base, ratio, status }
    }
    return { ...base, ratio: null, status: actual <= 0 ? 'met' : 'over' }
  }
  if (target <= 0) return { ...base, ratio: null, status: 'unscored' }
  const ratio = actual / target
  return {
    ...base,
    ratio,
    status: entry.kind === 'minimum' ? minimumStatus(ratio) : goalStatus(entry.key, ratio),
  }
}

function actualFor(entry: TargetEntry, day: DayTotals): number {
  if (entry.unit === 'serves') return day.foodGroups[entry.key as FoodGroupKey] ?? 0
  return day.totals[entry.key as NutrientKey] ?? 0
}

export function evaluateDay(day: DayTotals, targets: Targets): DayScore {
  const scores: Partial<Record<TargetKey, TargetScore>> = {}
  for (const entry of targets.entries) scores[entry.key] = scoreTarget(entry, actualFor(entry, day))

  const energy = scores.energy_kcal
  const energyRatio = energy?.ratio ?? 0
  const logged = !(
    day.entryCount < UNLOGGED_MAX_ENTRIES && energyRatio < UNLOGGED_ENERGY_RATIO - EPS
  )

  const all = Object.values(scores)
  const limitOver = all.some((score) => score.kind === 'limit' && score.status === 'over')
  const energyOk = energy?.status === 'met' || energy?.status === 'close'
  const proteinOk = scores.protein_g?.status === 'met'
  const dayMet = logged && energyOk && proteinOk && !limitOver

  const minimums = all.filter((score) => score.kind === 'minimum')
  const completeness =
    minimums.length === 0
      ? 0
      : minimums.filter((score) => score.status === 'met' || score.status === 'close').length /
        minimums.length

  return {
    logged,
    dayMet,
    completeness: Math.round(completeness * 1000) / 1000,
    entryCount: day.entryCount,
    scores,
  }
}

export function scoreFor(score: DayScore, key: TargetKey): TargetScore | undefined {
  return score.scores[key]
}
