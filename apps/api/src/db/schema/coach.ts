import type { CoachCard, CoachRole, CoachToolTrailEntry } from '@diet-tracker/shared'
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth.js'

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

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
 * line shown, duration); `cards` the drafted actions (empty until slice 11b); `error` the
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

export type CoachThreadRow = typeof coachThreads.$inferSelect
export type CoachMessageRow = typeof coachMessages.$inferSelect
export type NewCoachMessageRow = typeof coachMessages.$inferInsert
