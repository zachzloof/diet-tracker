import type {
  CoachBriefHalf,
  CoachCard,
  CoachRole,
  CoachToolTrailEntry,
} from '@diet-tracker/shared'
import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { users } from './auth.js'

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })
const day = (name: string) => date(name, { mode: 'string' })

/**
 * The coach's conversations (D41, option A: state in our Postgres, requests sent with
 * `store: false`). A thread is purged by `updated_at` under the six-month retention (D27),
 * exported with the account (D24) and cascades from `users`. `turns` counts user messages.
 */
export const coachThreads = pgTable(
  'coach_threads',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The first message, trimmed. */
    title: text('title').notNull().default(''),
    turns: integer('turns').notNull().default(0),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [index('coach_threads_user_updated_idx').on(t.userId, t.updatedAt)],
)

/**
 * One message. `user_id` is repeated so the daily turn cap is one count and the scoping is
 * one condition. `tool_trail` is what the assistant looked at (name, arguments, the status
 * line shown, duration); `cards` the drafted actions (slice 11b: `CoachCard[]`, each with its state); `error` the
 * failure recorded when the model could not answer, with `text` holding the failure copy.
 */
export const coachMessages = pgTable(
  'coach_messages',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => coachThreads.id, { onDelete: 'cascade' }),
    role: text('role').$type<CoachRole>().notNull(),
    text: text('text').notNull(),
    cards: jsonb('cards').$type<CoachCard[]>().notNull().default([]),
    toolTrail: jsonb('tool_trail').$type<CoachToolTrailEntry[]>().notNull().default([]),
    /** The `ai_calls` rows of the model rounds behind an assistant message. */
    aiCallIds: uuid('ai_call_ids').array().notNull().default([]),
    error: text('error'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('coach_messages_thread_created_idx').on(t.threadId, t.createdAt),
    index('coach_messages_user_created_idx').on(t.userId, t.createdAt),
  ],
)

/**
 * Lines the person asked the coach to remember ("left knee sore"), confirmed from a `note`
 * card (slice 11b, D41 option A for memory). Read into every briefing, listed and deleted
 * under Coach > Notes. Kept until deleted (not under the dated retention), exported with the
 * account, cascades from `users`. Capped at `COACH_MAX_NOTES` per person by the service.
 */
export const coachNotes = pgTable(
  'coach_notes',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [index('coach_notes_user_created_idx').on(t.userId, t.createdAt)],
)

/**
 * The one-line daily brief on Today (slice 11c), one row per person, half and local day,
 * written only when the model wrote the sentence (the app's own fallback sentence is
 * rebuilt on each open and never stored). Dated history: purged by `day` under the
 * six-month retention (D27), in the export as `coachBriefs`, cascades from `users`.
 */
export const coachBriefs = pgTable(
  'coach_briefs',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    half: text('half').$type<CoachBriefHalf>().notNull(),
    /** The person's local day (CLAUDE.md non-negotiable 5). */
    day: day('day').notNull(),
    text: text('text').notNull(),
    model: text('model').notNull(),
    generatedAt: timestamptz('generated_at').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('coach_briefs_user_half_day_idx').on(t.userId, t.half, t.day)],
)

export type CoachThreadRow = typeof coachThreads.$inferSelect
export type CoachMessageRow = typeof coachMessages.$inferSelect
export type NewCoachMessageRow = typeof coachMessages.$inferInsert
export type CoachNoteRow = typeof coachNotes.$inferSelect
export type CoachBriefRow = typeof coachBriefs.$inferSelect
