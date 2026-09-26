import type {
  Confidence,
  EntrySource,
  FoodBasis,
  FoodGroupServes,
  FoodSource,
  Meal,
  NutrientVector,
} from '@diet-tracker/shared'
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { aiCalls } from './ai.js'
import { users } from './auth.js'

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })
/** User-local calendar days are `date` columns read and written as `YYYY-MM-DD` strings. */
const day = (name: string) => date(name, { mode: 'string' })

/**
 * The foods library (D5 option C): manual entries and confirmed AI estimates, per user.
 * `user_id` is nullable so a shared catalogue can be added later without a migration.
 * The nutrient vector refers to `basis`: 100 g, or one serving of `serving_grams`.
 */
export const foods = pgTable(
  'foods',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    brand: text('brand'),
    basis: text('basis').$type<FoodBasis>().notNull(),
    servingGrams: doublePrecision('serving_grams'),
    servingLabel: text('serving_label'),
    nutrients: jsonb('nutrients').$type<NutrientVector>().notNull(),
    foodGroups: jsonb('food_groups').$type<FoodGroupServes>().notNull(),
    source: text('source').$type<FoodSource>().notNull(),
    verified: boolean('verified').notNull().default(false),
    lastUsedAt: timestamptz('last_used_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('foods_user_last_used_idx').on(t.userId, t.lastUsedAt),
    index('foods_user_name_idx').on(t.userId, t.name),
  ],
)

/**
 * One row per logged item. Nutrients are a snapshot for the total logged quantity, taken
 * at log time: editing the library food later never rewrites history.
 */
export const logEntries = pgTable(
  'log_entries',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The user's local day the entry belongs to; set by the API, never from server time. */
    day: day('day').notNull(),
    loggedAt: timestamptz('logged_at').notNull(),
    meal: text('meal').$type<Meal>().notNull(),
    name: text('name').notNull(),
    quantity: doublePrecision('quantity').notNull(),
    unit: text('unit').notNull(),
    grams: doublePrecision('grams').notNull(),
    nutrients: jsonb('nutrients').$type<NutrientVector>().notNull(),
    foodGroups: jsonb('food_groups').$type<FoodGroupServes>().notNull(),
    source: text('source').$type<EntrySource>().notNull(),
    foodId: uuid('food_id').references(() => foods.id, { onDelete: 'set null' }),
    aiCallId: uuid('ai_call_id').references(() => aiCalls.id, { onDelete: 'set null' }),
    assumptions: text('assumptions').array().notNull().default([]),
    confidence: text('confidence').$type<Confidence>(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [index('log_entries_user_day_idx').on(t.userId, t.day)],
)

/**
 * Day totals, rewritten in the same transaction as any write to `log_entries` for that
 * user and day, so hot reads never sum entries.
 */
export const dailySummaries = pgTable(
  'daily_summaries',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: day('day').notNull(),
    totals: jsonb('totals').$type<NutrientVector>().notNull(),
    foodGroups: jsonb('food_groups').$type<FoodGroupServes>().notNull(),
    entryCount: integer('entry_count').notNull().default(0),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('daily_summaries_user_day_idx').on(t.userId, t.day)],
)

export type FoodRow = typeof foods.$inferSelect
export type NewFoodRow = typeof foods.$inferInsert
export type LogEntryRow = typeof logEntries.$inferSelect
export type NewLogEntryRow = typeof logEntries.$inferInsert
export type DailySummaryRow = typeof dailySummaries.$inferSelect
