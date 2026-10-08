import { MEALS, isWaterEntry, sumPortions, type LogEntry, type Meal } from '@diet-tracker/shared'

/**
 * How the day log lists a meal of the day (D33). Ingredients logged together as one meal
 * (same `groupId`, same meal of the day) collapse into one row under the meal's name with
 * their total; everything else is a row of its own. Rows keep log order by first appearance.
 */

export interface SingleRow {
  kind: 'entry'
  entry: LogEntry
}

export interface GroupRow {
  kind: 'group'
  groupId: string
  name: string
  entries: LogEntry[]
  kcal: number
  grams: number
}

export type DayLogRow = SingleRow | GroupRow

export interface MealSection {
  meal: Meal
  rows: DayLogRow[]
  kcal: number
}

export function groupEntries(entries: readonly LogEntry[]): DayLogRow[] {
  const rows: DayLogRow[] = []
  const groups = new Map<string, GroupRow>()
  for (const entry of entries) {
    if (entry.groupId === null) {
      rows.push({ kind: 'entry', entry })
      continue
    }
    const existing = groups.get(entry.groupId)
    if (existing) {
      existing.entries.push(entry)
      existing.kcal += entry.nutrients.energy_kcal
      existing.grams += entry.grams
      continue
    }
    const group: GroupRow = {
      kind: 'group',
      groupId: entry.groupId,
      name: entry.groupName ?? 'Meal',
      entries: [entry],
      kcal: entry.nutrients.energy_kcal,
      grams: entry.grams,
    }
    groups.set(entry.groupId, group)
    rows.push(group)
  }
  return rows
}

/** The day's food entries by meal of the day, water left out, empty meals dropped. */
export function mealSections(entries: readonly LogEntry[]): MealSection[] {
  return MEALS.map((meal: Meal) => {
    const own = entries.filter((entry) => entry.meal === meal && !isWaterEntry(entry))
    return {
      meal,
      rows: groupEntries(own),
      kcal: own.reduce((sum, entry) => sum + entry.nutrients.energy_kcal, 0),
    }
  }).filter((section) => section.rows.length > 0)
}

/** The entries of one logged meal, in log order. */
export function groupMembers(entries: readonly LogEntry[], groupId: string): LogEntry[] {
  return entries.filter((entry) => entry.groupId === groupId)
}

/** The whole logged meal added up, for the sheet's summary strip. */
export function groupTotals(entries: readonly LogEntry[]) {
  return sumPortions(entries)
}
