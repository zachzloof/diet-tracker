import { sql } from 'drizzle-orm'
import { afterAll, beforeAll } from 'vitest'
import { loadDotEnv } from '../dotenv.js'
import { testDatabaseUrl } from './db-url.js'

/** Runs in every test worker before the test file's imports, so env is set before `env.ts` parses it. */
process.env.NODE_ENV = 'test'
loadDotEnv()
const base = process.env.DATABASE_URL
if (!base) throw new Error('DATABASE_URL is not set; see apps/api/.env.example')
process.env.DATABASE_URL = testDatabaseUrl(base)
process.env.LOG_LEVEL = 'silent'
process.env.SESSION_SECRET ??= 'test-only-session-secret-0123456789abcdef0123456789abcdef'
process.env.APP_ORIGIN ??= 'http://localhost:5173'
// Tests never call OpenAI; the explain route must answer ai_unavailable.
process.env.OPENAI_API_KEY = ''

beforeAll(async () => {
  const { db } = await import('../db/client.js')
  await db.execute(
    sql`truncate table ai_calls, weight_entries, target_versions, profiles, sessions, users cascade`,
  )
})

afterAll(async () => {
  const { closeDb } = await import('../db/client.js')
  await closeDb()
})
