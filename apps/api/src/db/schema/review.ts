import type { StoredWeeklyReview } from '@diet-tracker/shared'
import { date, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth.js'

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })
const day = (name: string) => date(name, { mode: 'string' })

/**
 * The AI weekly review, one row per user and ISO week (decision D17: generated on demand
 * when the Week screen opens, regenerated at most once a day). `review` is the validated
 * `StoredWeeklyReview`; `week_end` is the last day of the seven-day window it covers.
 */
export const weeklyReviews = pgTable(
  'weekly_reviews',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** `YYYY-Www` of `week_end`. */
    isoWeek: text('iso_week').notNull(),
    weekEnd: day('week_end').notNull(),
    review: jsonb('review').$type<StoredWeeklyReview>().notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('weekly_reviews_user_week_idx').on(t.userId, t.isoWeek)],
)

export type WeeklyReviewRow = typeof weeklyReviews.$inferSelect
