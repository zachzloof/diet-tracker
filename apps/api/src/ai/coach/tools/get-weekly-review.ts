import { coachToolArgsSchemas, isoWeek } from '@diet-tracker/shared'
import { and, eq } from 'drizzle-orm'
import { db } from '../../../db/client.js'
import { weeklyReviews } from '../../../db/schema/index.js'
import { defineTool, empty } from './types.js'

/** The cached AI weekly review for a week, never a fresh one (that is the Week screen's job). */
export const getWeeklyReview = defineTool({
  name: 'get_weekly_review',
  description:
    'The AI weekly review already written for the week containing week_end (summary, wins, the two changes, encouragement), if the person opened their Week screen that week. Never writes a new one.',
  schema: coachToolArgsSchemas.get_weekly_review,
  status: () => 'Reading the weekly review',
  async run(ctx, args) {
    const week = isoWeek(args.week_end ?? ctx.today)
    const row = (
      await db
        .select()
        .from(weeklyReviews)
        .where(and(eq(weeklyReviews.userId, ctx.userId), eq(weeklyReviews.isoWeek, week)))
        .limit(1)
    )[0]
    if (!row) return empty(`no weekly review has been written for ${week}`)
    const r = row.review
    return {
      iso_week: week,
      week_end: r.weekEnd,
      written_on: r.generatedAt.slice(0, 10),
      days_logged: r.daysLogged,
      summary: r.summary,
      wins: r.wins,
      changes: r.changes,
      encouragement: r.encouragement,
    }
  },
})
