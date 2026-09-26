import {
  addDays,
  currentStreak,
  daysOfMonth,
  emptyDayScore,
  evaluateDay,
  findGaps,
  localDay,
  monthOf,
  summariseWeek,
  weekWindow,
  type MonthStatsResponse,
  type Profile,
  type ScoredDay,
  type Targets,
  type WeekStatsResponse,
} from '@diet-tracker/shared'
import { and, asc, between, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { dailySummaries, targetVersions } from '../db/schema/index.js'
import { errors } from '../errors.js'

/**
 * Week and month statistics (db-schema skill, query conventions): seven `daily_summaries`
 * rows plus the target version in force on each day, scored with the shared `evaluateDay`
 * so the API and the Today screen agree. Nothing here sums log entries.
 */

/** How far back the streak looks. Longer streaks are capped at this. */
export const STREAK_LOOKBACK_DAYS = 90

/** The targets in force on each day: the latest version effective on or before it, else the earliest. */
export async function targetsByDay(
  userId: string,
  days: readonly string[],
): Promise<Map<string, Targets>> {
  const versions = await db
    .select({
      effectiveFrom: targetVersions.effectiveFrom,
      effective: targetVersions.effective,
    })
    .from(targetVersions)
    .where(eq(targetVersions.userId, userId))
    .orderBy(asc(targetVersions.effectiveFrom), asc(targetVersions.createdAt))
  const first = versions[0]
  if (!first) throw errors.profileRequired()
  const byDay = new Map<string, Targets>()
  for (const day of days) {
    let chosen = first
    for (const version of versions) {
      if (version.effectiveFrom <= day) chosen = version
      else break
    }
    byDay.set(day, chosen.effective)
  }
  return byDay
}

export interface ScoredDays {
  days: ScoredDay[]
  /** Days that have a summary row (logged or not). */
  present: Set<string>
}

/** Scores each day in `days` (a contiguous, ascending list) against that day's targets. */
export async function scoreDays(userId: string, days: readonly string[]): Promise<ScoredDays> {
  const first = days[0]
  const last = days[days.length - 1]
  if (!first || !last) return { days: [], present: new Set() }
  const [targets, summaries] = await Promise.all([
    targetsByDay(userId, days),
    db
      .select()
      .from(dailySummaries)
      .where(and(eq(dailySummaries.userId, userId), between(dailySummaries.day, first, last))),
  ])
  const byDay = new Map(summaries.map((row) => [row.day, row]))
  const present = new Set(byDay.keys())
  return {
    present,
    days: days.map((day) => {
      const summary = byDay.get(day)
      const dayTargets = targets.get(day)
      if (!summary || !dayTargets) return { day, score: emptyDayScore() }
      return {
        day,
        score: evaluateDay(
          {
            totals: summary.totals,
            foodGroups: summary.foodGroups,
            entryCount: summary.entryCount,
          },
          dayTargets,
        ),
      }
    }),
  }
}

function daysEnding(end: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(end, i - (count - 1)))
}

export async function weekStats(
  userId: string,
  profile: Profile,
  end: string | undefined,
  now: Date = new Date(),
): Promise<WeekStatsResponse> {
  const today = localDay(now, profile.timezone)
  const endDay = end ?? today
  if (endDay > today) {
    throw errors.validation({
      fieldErrors: { end: ['That week has not happened yet'] },
      formErrors: [],
    })
  }
  const window = weekWindow(endDay)
  const [scored, history] = await Promise.all([
    scoreDays(userId, window),
    scoreDays(userId, daysEnding(today, STREAK_LOOKBACK_DAYS)),
  ])
  const summary = summariseWeek(scored.days)
  const gaps = findGaps(
    scored.days.map((d) => d.score),
    {
      dietPattern: profile.dietPattern,
      allergies: profile.allergies,
      dislikes: profile.dislikes,
    },
  )
  return {
    start: window[0] ?? endDay,
    end: endDay,
    today,
    days: scored.days,
    daysLogged: summary.daysLogged,
    daysMet: summary.daysMet,
    streak: currentStreak(history.days, today),
    gaps,
  }
}

export async function monthStats(
  userId: string,
  profile: Profile,
  month: string | undefined,
  now: Date = new Date(),
): Promise<MonthStatsResponse> {
  const today = localDay(now, profile.timezone)
  const wanted = month ?? monthOf(today)
  const days = daysOfMonth(wanted).filter((day) => day <= today)
  if (days.length === 0) return { month: wanted, today, days: [] }
  const scored = await scoreDays(userId, days)
  return {
    month: wanted,
    today,
    days: scored.days
      .filter((d) => scored.present.has(d.day))
      .map((d) => ({ day: d.day, logged: d.score.logged, dayMet: d.score.dayMet })),
  }
}
