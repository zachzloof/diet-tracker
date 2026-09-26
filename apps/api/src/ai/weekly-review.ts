import {
  DIET_PATTERN_LABELS,
  FOOD_GROUPS,
  GOAL_LABELS,
  MIN_REVIEW_DAYS,
  NUTRIENTS,
  ageOn,
  isoWeek,
  localDay,
  summariseTarget,
  weeklyReviewSchema,
  type FoodGroupKey,
  type NutrientKey,
  type Profile,
  type ScoredDay,
  type StoredWeeklyReview,
  type TargetKey,
  type Targets,
  type WeekStatsResponse,
  type WeeklyReview,
  type WeeklyReviewResponse,
} from '@diet-tracker/shared'
import { and, eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { db } from '../db/client.js'
import { weeklyReviews } from '../db/schema/index.js'
import { env } from '../env.js'
import { errors } from '../errors.js'
import { requireLatestVersion } from '../profile/targets-service.js'
import { weekStats } from '../stats/stats-service.js'
import { callsToday } from './estimate.js'
import { callStructured } from './openai.js'

/**
 * Purpose `weekly_review` (ai-food-estimation skill): the model reads seven scored days,
 * the ranked gaps with their evidence and the targets, and writes a short review. It
 * never sees a number it can change; every claim must trace back to the supplied lines.
 * Cached per ISO week and regenerated at most once a day (decision D17).
 */

export const WEEKLY_REVIEW_SYSTEM_PROMPT = `You are a friendly, precise sports dietitian reviewing one week of a person's food diary. A deterministic engine has already scored each day against the person's targets and ranked the areas they are lacking, with evidence. Your job is to turn that into a short, specific review.

Rules:
- Base every claim on the supplied numbers. Quote them as given (kcal, g, mg, mcg, serves, percentages, day counts). Never invent a number, a day or a food the person ate.
- The two changes are the top two gaps in the list, in that order, unless a "high" gap further down makes one change obviously more important; then say why. Each change has a title (a few words), a why (one sentence quoting the evidence) and a how (one or two concrete, food-level actions).
- Suggest only foods that fit the person's diet pattern, allergies and dislikes. The suggestions listed under each gap have already been filtered for this person; prefer them.
- Wins come from what the numbers show went well: days met, a streak, targets hit on most days. One to three, each one sentence.
- The summary is two sentences on how the week went overall, including the days-met count.
- The encouragement is one sentence, specific to this week, not saccharine.
- Second person, warm but plain. No hype, no medical claims, no diagnosis. Today is in progress: do not judge it.
- Be brief: the whole answer is at most 170 words.`

function label(key: TargetKey): string {
  return key in NUTRIENTS
    ? NUTRIENTS[key as NutrientKey].label
    : FOOD_GROUPS[key as FoodGroupKey].label
}

function unit(key: TargetKey): string {
  return key in NUTRIENTS ? NUTRIENTS[key as NutrientKey].unitLabel : 'serves'
}

function fmt(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function pct(ratio: number | null): string {
  return ratio === null ? '' : ` (${Math.round(ratio * 100)}%)`
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function dayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d))
  return `${WEEKDAYS[(date.getUTCDay() + 6) % 7]} ${d} ${MONTHS[m - 1]}`
}

const DAY_LINE_KEYS: readonly TargetKey[] = [
  'energy_kcal',
  'protein_g',
  'carbs_g',
  'fat_g',
  'fiber_g',
  'sodium_mg',
  'water_ml',
]
const AVERAGE_KEYS: readonly TargetKey[] = [
  ...DAY_LINE_KEYS,
  'saturated_fat_g',
  'added_sugar_g',
  'vegetables',
  'fruit',
  'whole_grains',
  'protein_foods',
  'dairy_or_alt',
]

function dayLine(scored: ScoredDay, today: string): string {
  const { day, score } = scored
  const energy = score.scores.energy_kcal
  if (day === today && !score.logged) {
    return `- ${dayLabel(day)}: today, in progress (${fmt(energy?.actual ?? 0)} kcal so far)`
  }
  if (!score.logged) return `- ${dayLabel(day)}: nothing logged`
  const parts = DAY_LINE_KEYS.flatMap((key) => {
    const s = score.scores[key]
    if (!s) return []
    return [`${label(key).toLowerCase()} ${fmt(s.actual)} / ${fmt(s.target)} ${unit(key)}`]
  })
  const problems = Object.values(score.scores)
    .filter((s) => s.status === 'short' || s.status === 'over')
    .filter((s) => s.kind === 'goal' || s.kind === 'limit')
    .map((s) => `${label(s.key).toLowerCase()} ${s.status}`)
  const verdict = score.dayMet
    ? 'met'
    : `missed${problems.length ? ` (${problems.join(', ')})` : ''}`
  return `- ${dayLabel(day)}${day === today ? ' (today)' : ''}: ${parts.join(', ')}: ${verdict}`
}

export function buildWeeklyReviewUserMessage(
  profile: Profile,
  stats: WeekStatsResponse,
  targets: Targets,
): string {
  const lines: string[] = []
  lines.push('PERSON')
  lines.push(
    `- ${profile.sex === 'male' ? 'Male' : profile.sex === 'female' ? 'Female' : 'Adult'}, age ${ageOn(profile.dob, stats.today)}, ${fmt(profile.weightKg)} kg, goal: ${GOAL_LABELS[profile.goal].label.toLowerCase()}`,
  )
  lines.push(`- Diet pattern: ${DIET_PATTERN_LABELS[profile.dietPattern].label}`)
  lines.push(
    `- Allergies or intolerances: ${profile.allergies.length ? profile.allergies.join(', ') : 'none'}`,
  )
  lines.push(`- Dislikes: ${profile.dislikes.length ? profile.dislikes.join(', ') : 'none'}`)
  lines.push('')
  lines.push(
    `WEEK (${dayLabel(stats.start)} to ${dayLabel(stats.end)}; today is ${dayLabel(stats.today)})`,
  )
  lines.push(
    `- Days logged: ${stats.daysLogged} of 7. Days met: ${stats.daysMet}. Current streak: ${stats.streak} day${stats.streak === 1 ? '' : 's'}.`,
  )
  lines.push(
    '- A day is met when energy is within 20% of target, protein is at least 90% of target and no limit is exceeded. A day with under two entries and under 40% of energy counts as not logged.',
  )
  lines.push('')
  lines.push('DAYS (actual / target)')
  for (const day of stats.days) lines.push(dayLine(day, stats.today))
  lines.push('')
  lines.push('AVERAGES OVER LOGGED DAYS (actual / target)')
  for (const key of AVERAGE_KEYS) {
    const week = summariseTarget(stats.days, key)
    if (week.average === null || week.target === null) continue
    lines.push(
      `- ${label(key)}: ${fmt(week.average)} / ${fmt(week.target)} ${unit(key)}${pct(week.averageRatio)}, met on ${week.daysMet} of ${week.daysLogged} days`,
    )
  }
  lines.push('')
  lines.push('KEY TARGETS')
  for (const key of ['energy_kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g'] as const) {
    const entry = targets.entries.find((e) => e.key === key)
    if (entry) lines.push(`- ${label(key)}: ${fmt(entry.value)} ${unit(key)}. ${entry.reason}`)
  }
  lines.push('')
  if (stats.gaps.length === 0) {
    lines.push('GAPS: none. Every rule passed this week.')
  } else {
    lines.push('GAPS, RANKED (the two changes come from the top of this list)')
    stats.gaps.forEach((gap, i) => {
      lines.push(`${i + 1}. [${gap.severity}] ${gap.title}: ${gap.evidence}`)
      if (gap.suggestions.length) lines.push(`   Suggestions: ${gap.suggestions.join('; ')}`)
    })
  }
  return lines.join('\n')
}

function trim(review: WeeklyReview): WeeklyReview {
  const clean = (list: string[], max: number) =>
    list
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, max)
  return {
    summary: review.summary.trim(),
    wins: clean(review.wins, 3),
    changes: review.changes
      .map((c) => ({ title: c.title.trim(), why: c.why.trim(), how: c.how.trim() }))
      .filter((c) => c.title.length > 0)
      .slice(0, 2),
    encouragement: review.encouragement.trim(),
  }
}

export interface WeeklyReviewArgs {
  userId: string
  profile: Profile
  /** Last day of the window; defaults to the person's local today. */
  end?: string | undefined
  /** Regenerate even when a review from today exists. */
  force?: boolean
  now?: Date
}

/**
 * Returns the cached review for the window's ISO week when it was generated today (or the
 * window is in the past), otherwise generates one, subject to the person's daily AI cap.
 */
export async function weeklyReview(args: WeeklyReviewArgs): Promise<WeeklyReviewResponse> {
  const { userId, profile } = args
  const now = args.now ?? new Date()
  const stats = await weekStats(userId, profile, args.end, now)
  if (stats.daysLogged < MIN_REVIEW_DAYS) {
    return { review: null, daysLogged: stats.daysLogged, minimumDays: MIN_REVIEW_DAYS }
  }

  const week = isoWeek(stats.end)
  const cached = (
    await db
      .select()
      .from(weeklyReviews)
      .where(and(eq(weeklyReviews.userId, userId), eq(weeklyReviews.isoWeek, week)))
      .limit(1)
  )[0]
  if (cached && !args.force) {
    const generatedDay = localDay(new Date(cached.review.generatedAt), profile.timezone)
    const pastWindow = stats.end !== stats.today
    if (pastWindow || generatedDay === stats.today) {
      return { review: cached.review, daysLogged: stats.daysLogged, minimumDays: MIN_REVIEW_DAYS }
    }
  }

  const used = await callsToday(userId, profile.timezone, now)
  if (used >= env.AI_DAILY_CALL_CAP) throw errors.aiCapReached(env.AI_DAILY_CALL_CAP, used)

  const version = await requireLatestVersion(userId)
  const result = await callStructured({
    purpose: 'weekly_review',
    userId,
    schemaName: 'weekly_review',
    schema: weeklyReviewSchema,
    system: WEEKLY_REVIEW_SYSTEM_PROMPT,
    user: buildWeeklyReviewUserMessage(profile, stats, version.effective),
    maxOutputTokens: 1500,
  })
  const stored: StoredWeeklyReview = {
    ...trim(result.data),
    model: result.model,
    generatedAt: now.toISOString(),
    weekEnd: stats.end,
    daysLogged: stats.daysLogged,
  }
  await db
    .insert(weeklyReviews)
    .values({
      id: uuidv7(),
      userId,
      isoWeek: week,
      weekEnd: stats.end,
      review: stored,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [weeklyReviews.userId, weeklyReviews.isoWeek],
      set: { review: stored, weekEnd: stats.end, updatedAt: now },
    })
  return { review: stored, daysLogged: stats.daysLogged, minimumDays: MIN_REVIEW_DAYS }
}
