import { customType, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/** Case-insensitive text. The `citext` extension is created in the first migration. */
export const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'citext'
  },
})

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: citext('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
})

export const sessions = pgTable(
  'sessions',
  {
    /** sha256 hex of the cookie token. The raw token is never stored. */
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamptz('expires_at').notNull(),
    lastSeenAt: timestamptz('last_seen_at').notNull().defaultNow(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    userAgent: text('user_agent'),
  },
  (t) => [
    index('sessions_user_id_idx').on(t.userId),
    index('sessions_expires_at_idx').on(t.expiresAt),
  ],
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Session = typeof sessions.$inferSelect
