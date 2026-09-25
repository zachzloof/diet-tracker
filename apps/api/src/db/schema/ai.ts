import type { AiPurpose } from '@diet-tracker/shared'
import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth.js'

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

/**
 * One row per OpenAI call, whatever the outcome (CLAUDE.md non-negotiable 3). Drives the
 * per-user daily cap in slice 3 and lets the owner see the bill per user.
 */
export const aiCalls = pgTable(
  'ai_calls',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    purpose: text('purpose').$type<AiPurpose>().notNull(),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    latencyMs: integer('latency_ms').notNull(),
    ok: boolean('ok').notNull(),
    error: text('error'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [index('ai_calls_user_created_idx').on(t.userId, t.createdAt)],
)

export type AiCallRow = typeof aiCalls.$inferSelect
