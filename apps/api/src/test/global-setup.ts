import pg from 'pg'
import { loadDotEnv } from '../dotenv.js'
import { adminDatabaseUrl, TEST_DB_NAME, testDatabaseUrl } from './db-url.js'

/**
 * Runs once per `vitest` invocation: creates `diet_tracker_test` if needed and migrates it.
 * Each test file then truncates the tables it uses (see setup.ts).
 */
export default async function globalSetup(): Promise<void> {
  process.env.NODE_ENV = 'test'
  loadDotEnv()
  const base = process.env.DATABASE_URL
  if (!base) {
    throw new Error(
      'DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env and start Postgres with `docker compose up -d db`.',
    )
  }

  const admin = new pg.Client({ connectionString: adminDatabaseUrl(base) })
  await admin.connect()
  try {
    const existing = await admin.query('select 1 from pg_database where datname = $1', [
      TEST_DB_NAME,
    ])
    if (existing.rowCount === 0) await admin.query(`create database ${TEST_DB_NAME}`)
  } finally {
    await admin.end()
  }

  process.env.DATABASE_URL = testDatabaseUrl(base)
  process.env.LOG_LEVEL = 'silent'
  process.env.SESSION_SECRET ??= 'test-only-session-secret-0123456789abcdef0123456789abcdef'
  process.env.APP_ORIGIN ??= 'http://localhost:5173'

  const { runMigrations } = await import('../db/migrations.js')
  await runMigrations()
  const { closeDb } = await import('../db/client.js')
  await closeDb()
}
