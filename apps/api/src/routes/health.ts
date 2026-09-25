import type { HealthResponse } from '@diet-tracker/shared'
import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '../db/client.js'
import type { AppEnv } from '../types.js'

const DB_PING_TIMEOUT_MS = 2000

async function pingDb(): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('db ping timed out')), DB_PING_TIMEOUT_MS)
  })
  try {
    await Promise.race([db.execute(sql`select 1`), timeout])
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** Railway's healthcheck. 503 keeps the previous deployment serving when the DB is unreachable. */
export const healthRoutes = new Hono<AppEnv>().get('/', async (c) => {
  const dbOk = await pingDb()
  if (!dbOk) c.get('log').error('health check: database unreachable')
  const body: HealthResponse = {
    ok: dbOk,
    version: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
    db: dbOk ? 'ok' : 'error',
  }
  return c.json(body, dbOk ? 200 : 503)
})
