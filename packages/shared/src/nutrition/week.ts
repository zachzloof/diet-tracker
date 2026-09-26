import { z } from 'zod'
import { addDays } from '../dates.js'
import { dayScoreSchema, type DayScore, type TargetStatus } from './scoring.js'
import type { TargetKey } from './targets.js'

/**
 * Week helpers over scored days: the seven-day window, the current streak, and one
 * target's week (days met, statuses per day, averages). Pure; the Week screen and the
 * weekly review prompt both read these.
 */

export const scoredDaySchema = z.object({ day: z.iso.date(), score: dayScoreSchema })
export type ScoredDay = z.infer<typeof scoredDaySchema>

export const WEEK_DAYS = 7

/** The seven calendar days ending on `end`, oldest first. */
export function weekWindow(end: string): string[] {
  return Array.from({ length: WEEK_DAYS }, (_, i) => addDays(end, i - (WEEK_DAYS - 1)))
}

/**
 * Consecutive met days ending today, or ending yesterday when today is not (yet) met, so
 * a streak survives until the day is actually over. An unlogged day breaks it.
 */
export function currentStreak(days: readonly ScoredDay[], today: string): number {
  const byDay = new Map(days.map((d) => [d.day, d.score]))
  let day = byDay.get(today)?.dayMet ? today : addDays(today, -1)
  let streak = 0
  while (byDay.get(day)?.dayMet) {
    streak += 1
    day = addDays(day, -1)
  }
  return streak
}

export interface TargetWeek {
  key: TargetKey
  /** Logged days on which the target was met. */
  daysMet: number
  daysLogged: number
  /** One status per day in the window; null for unlogged days or days without the target. */
  statuses: (TargetStatus | null)[]
  /** Average actual over logged days, or null with none. */
  average: number | null
  averageRatio: number | null
  target: number | null
}

export function summariseTarget(days: readonly ScoredDay[], key: TargetKey): TargetWeek {
  const statuses: (TargetStatus | null)[] = []
  let daysMet = 0
  let daysLogged = 0
  let actualSum = 0
  let ratioSum = 0
  let ratioCount = 0
  let target: number | null = null
  for (const { score } of days) {
    const entry = score.scores[key]
    if (!score.logged || !entry) {
      statuses.push(null)
      continue
    }
    statuses.push(entry.status)
    daysLogged += 1
    actualSum += entry.actual
    if (entry.status === 'met') daysMet += 1
    if (entry.ratio !== null) {
      ratioSum += entry.ratio
      ratioCount += 1
    }
    target = entry.target
  }
  return {
    key,
    daysMet,
    daysLogged,
    statuses,
    average: daysLogged > 0 ? actualSum / daysLogged : null,
    averageRatio: ratioCount > 0 ? ratioSum / ratioCount : null,
    target,
  }
}

export interface WeekSummary {
  daysLogged: number
  daysMet: number
  /** Mean completeness over logged days, 0 with none. */
  completeness: number
}

export function summariseWeek(days: readonly ScoredDay[]): WeekSummary {
  const logged = days.filter((d) => d.score.logged)
  const daysMet = logged.filter((d) => d.score.dayMet).length
  const completeness =
    logged.length === 0
      ? 0
      : logged.reduce((sum, d) => sum + d.score.completeness, 0) / logged.length
  return { daysLogged: logged.length, daysMet, completeness }
}

/** A blank score for a day with nothing logged, so a week always has seven entries. */
export function emptyDayScore(): DayScore {
  return { logged: false, dayMet: false, completeness: 0, entryCount: 0, scores: {} }
}
