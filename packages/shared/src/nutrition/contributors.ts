import { isNutrientKey, type FoodGroupServes, type NutrientVector } from './nutrients.js'
import type { TargetKey } from './targets.js'

/**
 * `contributionsTo`: which of a day's entries supplied a nutrient or a food group, largest
 * first, each with its share of the day's total. It answers "what is pushing me over on
 * saturated fat" and "what already gives me zinc" on Today. Pure; the entries are the same
 * snapshots the daily summary adds up, so the amounts sum to the number on the tile.
 */

export interface ContributingEntry {
  nutrients: NutrientVector
  foodGroups: FoodGroupServes
}

export interface Contribution<T> {
  entry: T
  /** The entry's amount, in the key's own unit (serves for a food group). */
  amount: number
  /** `amount` over the day's total for the key, 0 to 1. */
  share: number
}

export interface ContributionBreakdown<T> {
  /** The day's total for the key across every entry. */
  total: number
  /** The largest contributors, at most `limit`, largest first; ties keep log order. */
  top: Contribution<T>[]
  /** Every other contributor folded into one line; null when nothing is left over. */
  rest: { count: number; amount: number; share: number } | null
}

export const MAX_CONTRIBUTORS = 5

/** An entry's amount of a nutrient or food group; anything not a positive number counts as 0. */
export function amountOf(entry: ContributingEntry, key: TargetKey): number {
  const value = isNutrientKey(key) ? entry.nutrients[key] : entry.foodGroups[key]
  return Number.isFinite(value) && value > 0 ? value : 0
}

export function contributionsTo<T extends ContributingEntry>(
  entries: readonly T[],
  key: TargetKey,
  limit: number = MAX_CONTRIBUTORS,
): ContributionBreakdown<T> {
  const found = entries.flatMap((entry) => {
    const amount = amountOf(entry, key)
    return amount > 0 ? [{ entry, amount }] : []
  })
  const total = found.reduce((sum, c) => sum + c.amount, 0)
  const shareOf = (amount: number) => (total > 0 ? amount / total : 0)
  // Array.prototype.sort is stable, so equal amounts stay in the order they were logged.
  const ranked = found
    .map((c) => ({ ...c, share: shareOf(c.amount) }))
    .sort((a, b) => b.amount - a.amount)
  const top = ranked.slice(0, Math.max(0, limit))
  const others = ranked.slice(top.length)
  const restAmount = others.reduce((sum, c) => sum + c.amount, 0)
  return {
    total,
    top,
    rest:
      others.length === 0
        ? null
        : { count: others.length, amount: restAmount, share: shareOf(restAmount) },
  }
}
