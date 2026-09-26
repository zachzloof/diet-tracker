import {
  foodSchema,
  type Food,
  type FoodInput,
  type FoodSource,
  type FoodsQuery,
} from '@diet-tracker/shared'
import { and, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import type { LibraryMatch } from '../ai/estimate.js'
import { db } from '../db/client.js'
import { foods, type FoodRow } from '../db/schema/index.js'
import { errors } from '../errors.js'
import type { Tx } from '../profile/targets-service.js'

/** Validates the JSONB on the way out so a stray shape never reaches the browser. */
export function toWireFood(row: FoodRow): Food {
  return foodSchema.parse({
    id: row.id,
    name: row.name,
    brand: row.brand,
    basis: row.basis,
    servingGrams: row.servingGrams,
    servingLabel: row.servingLabel,
    nutrients: row.nutrients,
    foodGroups: row.foodGroups,
    source: row.source,
    verified: row.verified,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
}

/** `%` and `_` are wildcards in LIKE; a person searching for "100%" means the characters. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

/** The user's own foods, or shared ones (user_id null) later. */
function ownedBy(userId: string): SQL {
  return or(eq(foods.userId, userId), isNull(foods.userId)) ?? sql`true`
}

/** Most recently used first, then most recently edited. */
const recentFirst = [sql`${foods.lastUsedAt} desc nulls last`, desc(foods.updatedAt)]

export async function listFoods(userId: string, query: FoodsQuery): Promise<Food[]> {
  const conditions: SQL[] = [ownedBy(userId)]
  if (query.q.length > 0) {
    const pattern = `%${escapeLike(query.q)}%`
    conditions.push(or(ilike(foods.name, pattern), ilike(foods.brand, pattern)) ?? sql`true`)
  }
  const rows = await db
    .select()
    .from(foods)
    .where(and(...conditions))
    .orderBy(...recentFirst)
    .limit(query.limit)
  return rows.map(toWireFood)
}

export async function getFood(userId: string, id: string, tx: Tx = db): Promise<FoodRow> {
  const rows = await tx
    .select()
    .from(foods)
    .where(and(eq(foods.id, id), ownedBy(userId)))
    .limit(1)
  const row = rows[0]
  if (!row) throw errors.notFound()
  return row
}

export interface CreateFoodOptions {
  source: FoodSource
  verified: boolean
  now?: Date
}

export async function createFood(
  userId: string,
  input: FoodInput,
  options: CreateFoodOptions,
  tx: Tx = db,
): Promise<FoodRow> {
  const now = options.now ?? new Date()
  const inserted = await tx
    .insert(foods)
    .values({
      id: uuidv7(),
      userId,
      name: input.name,
      brand: input.brand,
      basis: input.basis,
      servingGrams: input.servingGrams,
      servingLabel: input.servingLabel,
      nutrients: input.nutrients,
      foodGroups: input.foodGroups,
      source: options.source,
      verified: options.verified,
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
  const row = inserted[0]
  if (!row) throw new Error('food insert returned no row')
  return row
}

/** A manual edit makes the values the person's own, so the food becomes verified. */
export async function updateFood(userId: string, id: string, input: FoodInput): Promise<FoodRow> {
  const updated = await db
    .update(foods)
    .set({
      name: input.name,
      brand: input.brand,
      basis: input.basis,
      servingGrams: input.servingGrams,
      servingLabel: input.servingLabel,
      nutrients: input.nutrients,
      foodGroups: input.foodGroups,
      verified: true,
      updatedAt: new Date(),
    })
    .where(and(eq(foods.id, id), eq(foods.userId, userId)))
    .returning()
  const row = updated[0]
  if (!row) throw errors.notFound()
  return row
}

/** Deleting a food leaves its log entries in place (their `food_id` becomes null). */
export async function deleteFood(userId: string, id: string): Promise<void> {
  const deleted = await db
    .delete(foods)
    .where(and(eq(foods.id, id), eq(foods.userId, userId)))
    .returning({ id: foods.id })
  if (deleted.length === 0) throw errors.notFound()
}

/** Records that these foods were just logged, so they sort to the top of the library. */
export async function touchFoods(tx: Tx, userId: string, ids: string[], at: Date): Promise<void> {
  if (ids.length === 0) return
  await tx
    .update(foods)
    .set({ lastUsedAt: at })
    .where(and(eq(foods.userId, userId), inArray(foods.id, ids)))
}

/** Which of `ids` the user actually owns; anything else is rejected upstream. */
export async function ownedFoodIds(tx: Tx, userId: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const rows = await tx
    .select({ id: foods.id })
    .from(foods)
    .where(and(ownedBy(userId), inArray(foods.id, ids)))
  return new Set(rows.map((row) => row.id))
}

const STOP_WORDS = new Set([
  'and',
  'with',
  'the',
  'had',
  'ate',
  'some',
  'about',
  'for',
  'from',
  'this',
  'that',
  'plus',
  'two',
  'three',
  'four',
  'five',
  'half',
  'large',
  'small',
  'medium',
  'cup',
  'cups',
  'slice',
  'slices',
  'piece',
  'pieces',
  'bowl',
  'plate',
  'glass',
  'grams',
])

/** Words worth matching a library food on: letters only, 3+ characters, not filler. */
export function searchWords(text: string): string[] {
  const words = text
    .toLowerCase()
    .split(/[^a-zÀ-ɏ]+/i)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word))
  return [...new Set(words)].slice(0, 12)
}

/**
 * Verified foods whose name or brand shares a word with the input, for the prompt's memory
 * (ai-food-estimation skill rule 6). The second "my protein shake" should equal the first.
 */
export async function findLibraryMatches(
  userId: string,
  text: string,
  limit: number,
): Promise<LibraryMatch[]> {
  const words = searchWords(text)
  if (words.length === 0) return []
  const wordMatches = words.flatMap((word) => {
    const pattern = `%${escapeLike(word)}%`
    return [ilike(foods.name, pattern), ilike(foods.brand, pattern)]
  })
  const rows = await db
    .select()
    .from(foods)
    .where(and(ownedBy(userId), eq(foods.verified, true), or(...wordMatches)))
    .orderBy(...recentFirst)
    .limit(limit)
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    brand: row.brand,
    basis: row.basis,
    servingGrams: row.servingGrams,
    servingLabel: row.servingLabel,
    nutrients: row.nutrients,
    foodGroups: row.foodGroups,
  }))
}
