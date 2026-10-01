import type { FoodGroupServes, NutrientVector } from '@diet-tracker/shared'
import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { users } from './auth.js'
import { foods } from './log.js'

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

/** A named set of ingredients a person eats together often and logs in one go. */
export const savedMeals = pgTable(
  'saved_meals',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    lastUsedAt: timestamptz('last_used_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [index('saved_meals_user_last_used_idx').on(t.userId, t.lastUsedAt)],
)

/**
 * One ingredient of a saved meal, for one portion of the meal. Like a log entry, the
 * nutrients are a snapshot for the whole quantity, taken when the ingredient was added:
 * editing the library food later does not change the meal, and deleting it only clears
 * the link.
 */
export const savedMealItems = pgTable(
  'saved_meal_items',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mealId: uuid('meal_id')
      .notNull()
      .references(() => savedMeals.id, { onDelete: 'cascade' }),
    /** Order within the meal, from 0. */
    position: integer('position').notNull(),
    name: text('name').notNull(),
    quantity: doublePrecision('quantity').notNull(),
    unit: text('unit').notNull(),
    grams: doublePrecision('grams').notNull(),
    nutrients: jsonb('nutrients').$type<NutrientVector>().notNull(),
    foodGroups: jsonb('food_groups').$type<FoodGroupServes>().notNull(),
    foodId: uuid('food_id').references(() => foods.id, { onDelete: 'set null' }),
  },
  (t) => [index('saved_meal_items_meal_idx').on(t.mealId, t.position)],
)

export type SavedMealRow = typeof savedMeals.$inferSelect
export type SavedMealItemRow = typeof savedMealItems.$inferSelect
export type NewSavedMealItemRow = typeof savedMealItems.$inferInsert
