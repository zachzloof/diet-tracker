import { RETENTION_DAYS, addDays } from '@diet-tracker/shared'
import { sql } from 'drizzle-orm'
import { db } from '../db/client.js'

export interface PurgeResult {
  /** Rows older than this day (or instant) were removed. */
  cutoffDay: string
  logEntries: number
  dailySummaries: number
  weightEntries: number
  weeklyReviews: number
  aiCalls: number
  targetVersions: number
}

/**
 * The retention rule the privacy policy promises: dated history older than
 * `RETENTION_DAYS` is deleted for everyone. The food log and its daily summaries, weigh-ins,
 * weekly reviews and AI usage rows go by their day. A target version goes only once a
 * newer version was already in force at the cutoff, so every day that is kept is still
 * scored against the targets it had. The account, the profile, the current targets and the
 * saved foods and meals are not history and stay until the person deletes them.
 *
 * The cutoff is a UTC calendar day; a person's local day differs by at most a day, which
 * does not matter at six months.
 */
export async function purgeExpiredData(now: Date = new Date()): Promise<PurgeResult> {
  const cutoffDay = addDays(now.toISOString().slice(0, 10), -RETENTION_DAYS)
  const cutoffInstant = new Date(`${cutoffDay}T00:00:00.000Z`)

  return db.transaction(async (tx) => {
    const count = async (query: ReturnType<typeof sql>): Promise<number> =>
      (await tx.execute(query)).rowCount ?? 0

    return {
      cutoffDay,
      logEntries: await count(sql`delete from log_entries where day < ${cutoffDay}`),
      dailySummaries: await count(sql`delete from daily_summaries where day < ${cutoffDay}`),
      weightEntries: await count(sql`delete from weight_entries where day < ${cutoffDay}`),
      weeklyReviews: await count(sql`delete from weekly_reviews where week_end < ${cutoffDay}`),
      aiCalls: await count(sql`delete from ai_calls where created_at < ${cutoffInstant}`),
      targetVersions: await count(sql`
        delete from target_versions old
        where old.effective_from < ${cutoffDay}
          and exists (
            select 1 from target_versions newer
            where newer.user_id = old.user_id
              and newer.effective_from <= ${cutoffDay}
              and (newer.effective_from, newer.created_at) > (old.effective_from, old.created_at)
          )
      `),
    }
  })
}
