import type {
  Overrides,
  SafetyFlags,
  StoredPlanExplanation,
  TargetInput,
  TargetTrigger,
  Targets,
} from '@diet-tracker/shared'
import {
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
import { users } from './auth.js'

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })
/** User-local calendar days are `date` columns read and written as `YYYY-MM-DD` strings. */
const day = (name: string) => date(name, { mode: 'string' })

/**
 * One row per user. Enum columns are text validated by the zod schemas in
 * `@diet-tracker/shared`, so adding a value is a code change, not a migration.
 */
export const profiles = pgTable('profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  sex: text('sex').notNull(),
  dob: day('dob').notNull(),
  heightCm: doublePrecision('height_cm').notNull(),
  weightKg: doublePrecision('weight_kg').notNull(),
  bodyFatPct: doublePrecision('body_fat_pct'),
  goal: text('goal').notNull(),
  pace: text('pace'),
  goalWeightKg: doublePrecision('goal_weight_kg'),
  activity: text('activity').notNull(),
  trainingType: text('training_type').notNull(),
  trainingDays: integer('training_days').notNull(),
  dietPattern: text('diet_pattern').notNull(),
  allergies: text('allergies').array().notNull().default([]),
  dislikes: text('dislikes').array().notNull().default([]),
  timezone: text('timezone').notNull(),
  units: text('units').notNull(),
  flags: jsonb('flags').$type<SafetyFlags>().notNull(),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
})

/**
 * Targets are versioned: a profile change inserts a new row and older rows stay as history.
 * The latest `effective_from` (then `created_at`) wins. Overrides are edited in place on the
 * current row; `effective` is the engine output with those overrides pinned.
 */
export const targetVersions = pgTable(
  'target_versions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    effectiveFrom: day('effective_from').notNull(),
    trigger: text('trigger').$type<TargetTrigger>().notNull(),
    inputs: jsonb('inputs').$type<TargetInput>().notNull(),
    computed: jsonb('computed').$type<Targets>().notNull(),
    overrides: jsonb('overrides').$type<Overrides>().notNull().default({}),
    effective: jsonb('effective').$type<Targets>().notNull(),
    explanation: jsonb('explanation').$type<StoredPlanExplanation>(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [index('target_versions_user_effective_idx').on(t.userId, t.effectiveFrom, t.createdAt)],
)

export const weightEntries = pgTable(
  'weight_entries',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: day('day').notNull(),
    weightKg: doublePrecision('weight_kg').notNull(),
    note: text('note'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('weight_entries_user_day_idx').on(t.userId, t.day)],
)

export type ProfileRow = typeof profiles.$inferSelect
export type NewProfileRow = typeof profiles.$inferInsert
export type TargetVersionRow = typeof targetVersions.$inferSelect
export type NewTargetVersionRow = typeof targetVersions.$inferInsert
export type WeightEntryRow = typeof weightEntries.$inferSelect
