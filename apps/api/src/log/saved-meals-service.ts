import {
  MAX_SAVED_MEALS,
  savedMealSchema,
  type SavedMeal,
  type SavedMealInput,
} from '@diet-tracker/shared'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { db } from '../db/client.js'
import {
  savedMealItems,
  savedMeals,
  type NewSavedMealItemRow,
  type SavedMealItemRow,
  type SavedMealRow,
} from '../db/schema/index.js'
import { errors } from '../errors.js'
import type { Tx } from '../profile/targets-service.js'
import { ownedFoodIds } from './foods-service.js'

/**
 * Saved meals: named sets of ingredients logged in one go. Ingredients are snapshots, like
 * log entries (db-schema skill): a later edit to a library food does not reach into a meal.
 * Logging one goes through the ordinary `createEntries`, which calls `touchSavedMeal`.
 */

/** Validates the JSONB on the way out so a stray shape never reaches the browser. */
export function toWireSavedMeal(row: SavedMealRow, items: readonly SavedMealItemRow[]): SavedMeal {
  return savedMealSchema.parse({
    id: row.id,
    name: row.name,
    items: items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      grams: item.grams,
      nutrients: item.nutrients,
      foodGroups: item.foodGroups,
      foodId: item.foodId,
    })),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
}

/** Most recently logged first, then most recently edited: the regulars stay at the top. */
const recentFirst = [sql`${savedMeals.lastUsedAt} desc nulls last`, desc(savedMeals.updatedAt)]

export async function listSavedMeals(
  userId: string,
  order: 'recent' | 'created' = 'recent',
): Promise<SavedMeal[]> {
  const [meals, items] = await Promise.all([
    db
      .select()
      .from(savedMeals)
      .where(eq(savedMeals.userId, userId))
      .orderBy(...(order === 'recent' ? recentFirst : [asc(savedMeals.createdAt)])),
    db
      .select()
      .from(savedMealItems)
      .where(eq(savedMealItems.userId, userId))
      .orderBy(asc(savedMealItems.mealId), asc(savedMealItems.position)),
  ])
  const byMeal = new Map<string, SavedMealItemRow[]>()
  for (const item of items) {
    const list = byMeal.get(item.mealId)
    if (list) list.push(item)
    else byMeal.set(item.mealId, [item])
  }
  return meals.map((meal) => toWireSavedMeal(meal, byMeal.get(meal.id) ?? []))
}

/**
 * The rows for a meal's ingredients, in order. A food id the person does not own (a food
 * deleted on another screen, or somebody else's) loses the link and keeps its numbers: the
 * snapshot is what the meal is made of, the link only says where it came from.
 */
async function itemRows(
  tx: Tx,
  userId: string,
  mealId: string,
  input: SavedMealInput,
): Promise<NewSavedMealItemRow[]> {
  const owned = await ownedFoodIds(
    tx,
    userId,
    input.items.flatMap((item) => (item.foodId ? [item.foodId] : [])),
  )
  return input.items.map((item, position) => ({
    id: uuidv7(),
    userId,
    mealId,
    position,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    grams: item.grams,
    nutrients: item.nutrients,
    foodGroups: item.foodGroups,
    foodId: item.foodId && owned.has(item.foodId) ? item.foodId : null,
  }))
}

/**
 * Creates a meal. Pass `tx` to create it inside a caller's transaction (logging entries with
 * "Add to meals"), and `lastUsedAt` when the meal is being logged as it is created.
 */
export async function createSavedMeal(
  userId: string,
  input: SavedMealInput,
  now: Date = new Date(),
  options: { tx?: Tx; lastUsedAt?: Date | null } = {},
): Promise<SavedMeal> {
  const run = async (tx: Tx): Promise<SavedMeal> => {
    const counted = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(savedMeals)
      .where(eq(savedMeals.userId, userId))
    if ((counted[0]?.count ?? 0) >= MAX_SAVED_MEALS) {
      throw errors.conflict(
        `You can save up to ${MAX_SAVED_MEALS} meals. Delete one you no longer use to add another.`,
      )
    }
    const inserted = await tx
      .insert(savedMeals)
      .values({
        id: uuidv7(),
        userId,
        name: input.name,
        lastUsedAt: options.lastUsedAt ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    const meal = inserted[0]
    if (!meal) throw new Error('saved meal insert returned no row')
    const items = await tx
      .insert(savedMealItems)
      .values(await itemRows(tx, userId, meal.id, input))
      .returning()
    return toWireSavedMeal(meal, items)
  }
  return options.tx ? run(options.tx) : db.transaction(run)
}

/** Replaces the name and the whole ingredient list. Entries already logged are untouched. */
export async function updateSavedMeal(
  userId: string,
  id: string,
  input: SavedMealInput,
  now: Date = new Date(),
): Promise<SavedMeal> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(savedMeals)
      .set({ name: input.name, updatedAt: now })
      .where(and(eq(savedMeals.id, id), eq(savedMeals.userId, userId)))
      .returning()
    const meal = updated[0]
    if (!meal) throw errors.notFound()
    await tx.delete(savedMealItems).where(eq(savedMealItems.mealId, id))
    const items = await tx
      .insert(savedMealItems)
      .values(await itemRows(tx, userId, id, input))
      .returning()
    return toWireSavedMeal(meal, items)
  })
}

/** Deleting a meal removes its ingredients with it and leaves the log as it was. */
export async function deleteSavedMeal(userId: string, id: string): Promise<void> {
  const deleted = await db
    .delete(savedMeals)
    .where(and(eq(savedMeals.id, id), eq(savedMeals.userId, userId)))
    .returning({ id: savedMeals.id })
  if (deleted.length === 0) throw errors.notFound()
}

/** Records that the meal was just logged. Somebody else's id, or a deleted one, does nothing. */
/**
 * Marks the meal as used now and returns its name, or null when the id is not one of this
 * person's meals (deleted, or somebody else's), which logging treats as "no saved meal".
 */
export async function touchSavedMeal(
  tx: Tx,
  userId: string,
  id: string,
  at: Date,
): Promise<string | null> {
  const rows = await tx
    .update(savedMeals)
    .set({ lastUsedAt: at })
    .where(and(eq(savedMeals.id, id), eq(savedMeals.userId, userId)))
    .returning({ name: savedMeals.name })
  return rows[0]?.name ?? null
}
