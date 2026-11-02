import {
  MIN_REVIEW_DAYS,
  isoWeek,
  localDay,
  weeklyReviewSchema,
  type Profile,
  type StoredWeeklyReview,
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
import { personLines, targetLines, weekLines } from './coach/briefing.js'
import { callsToday } from './estimate.js'
import { callStructured } from './openai.js'

/**
 * Purpose `weekly_review` (ai-food-estimation skill): the model reads seven scored days,
 * the ranked gaps with their evidence and the targets, and writes a short review. It
 * never sees a number it can change; every claim must trace back to the supplied lines.
 * Cached per ISO week and regenerated at most once a day (decision D17). Since slice 11c
 * the lines are the coach's own briefing sections (`coach/briefing.ts`), so the review and
 * the coach quote the same numbers and the same verdicts.
 */

export const WEEKLY_REVIEW_SYSTEM_PROMPT = `You are a friendly, precise sports dietitian reviewing one week of a person's food diary. A deterministic engine has already scored each day against the person's targets and ranked the areas they are lacking, with evidence. Your job is to turn that into a short, specific review.

Rules:
- Base every claim on the supplied numbers. Quote them as given (kcal, g, mg, mcg, serves, percentages, day counts). Never invent a number, a day or a food the person ate.
- The two changes are the top two gaps in the list, in that order, unless a "high" gap further down makes one change obviously more important; then say why. Each change has a title (a few words), a why (one sentence quoting the evidence) and a how (one or two concrete, food-level actions).
- Suggest only foods that fit the person's diet pattern, allergies and dislikes. The suggestions listed under each gap ("Fits this person") have already been filtered for this person; prefer them.
- Wins come from what the numbers show went well: days met, a streak, targets hit on most days. One to three, each one sentence.
- The summary is two sentences on how the week went overall, including the days-met count.
- The encouragement is one sentence, specific to this week, not saccharine.
- Second person, warm but plain. No hype, no medical claims, no diagnosis. Today is in progress: do not judge it.
- Be brief: the whole answer is at most 170 words.`

export function buildWeeklyReviewUserMessage(
  profile: Profile,
  stats: WeekStatsResponse,
  targets: Targets,
): string {
  const prefs = profile.preferences
  return [
    ...personLines(profile, stats.today),
    '',
    ...targetLines(targets, prefs),
    '',
    ...weekLines(stats, stats.today, prefs, 'full'),
    '',
    'REVIEW NOTES',
    '- A day with under two entries and under 40% of energy counts as not logged. Limits that do not decide the day are still worth a mention when they are over most days.',
    '- The two changes come from the top of the gap list.',
  ].join('\n')
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
