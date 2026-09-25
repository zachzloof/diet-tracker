import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { fileURLToPath } from 'node:url'
import { db } from './client.js'

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

/** Applies pending migrations. Safe to run on every boot; applied files are skipped. */
export async function runMigrations(): Promise<{ applied: number; total: number }> {
  const before = await appliedCount()
  await migrate(db, { migrationsFolder })
  const total = await appliedCount()
  return { applied: total - before, total }
}
