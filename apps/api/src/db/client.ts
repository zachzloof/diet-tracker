import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { env } from '../env.js'
import * as schema from './schema/index.js'

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  // Fail fast on a wrong host or port instead of hanging forever (see .env.example).
  connectionTimeoutMillis: 10_000,
})

export const db = drizzle({ client: pool, schema })
export type Db = typeof db

export async function closeDb(): Promise<void> {
  await pool.end()
}
