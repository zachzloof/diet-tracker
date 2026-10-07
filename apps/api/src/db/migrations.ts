import {
  ENGINE_VERSION,
  computeTargets,
  overridesSchema,
  targetInputSchema,
  targetsSchema,
} from '@diet-tracker/shared'
import { eq, sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { fileURLToPath } from 'node:url'
import { db } from './client.js'
import { targetVersions } from './schema/index.js'

/** `apps/api/drizzle`, whether running from `src/` (tsx) or `dist/` (built). */
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))

async function appliedCount(): Promise<number> {
  const exists = await db.execute(
    sql`select to_regclass('drizzle.__drizzle_migrations') is not null as exists`,
  )
  if (exists.rows[0]?.exists !== true) return 0
  const counted = await db.execute(
    sql`select count(*)::int as count from drizzle.__drizzle_migrations`,
  )
  const count = counted.rows[0]?.count
  return typeof count === 'number' ? count : 0
}

/**
 * Recomputes every stored target version whose engine is behind `ENGINE_VERSION`, from its own
 * inputs and overrides, so a nutrient added to the engine (vitamin E, K, iodine and omega-3 in
 * version 2) gets a target for existing people without waiting for a profile edit. The inputs,
 * overrides, trigger and effective-from date are untouched; only `computed` and `effective`
 * change, which is what a fresh run of the same engine would have written. Idempotent.
 */
export async function upgradeTargetVersions(): Promise<number> {
  const stale = await db
    .select({
      id: targetVersions.id,
      inputs: targetVersions.inputs,
      overrides: targetVersions.overrides,
    })
    .from(targetVersions)
    .where(
      sql`coalesce((${targetVersions.computed} -> 'meta' ->> 'engineVersion')::int, 0) < ${ENGINE_VERSION}`,
    )
  for (const row of stale) {
    const inputs = targetInputSchema.parse(row.inputs)
    const overrides = overridesSchema.parse(row.overrides)
    const computed = targetsSchema.parse(computeTargets(inputs))
    const effective = targetsSchema.parse(computeTargets(inputs, overrides))
    await db
      .update(targetVersions)
      .set({ computed, effective })
      .where(eq(targetVersions.id, row.id))
  }
  return stale.length
}

/** Applies pending migrations, then any engine upgrade. Safe to run on every boot. */
export async function runMigrations(): Promise<{
  applied: number
  total: number
  targetVersionsUpgraded: number
}> {
  const before = await appliedCount()
  await migrate(db, { migrationsFolder })
  const total = await appliedCount()
  const targetVersionsUpgraded = await upgradeTargetVersions()
  return { applied: total - before, total, targetVersionsUpgraded }
}
