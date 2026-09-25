import { v7 as uuidv7 } from 'uuid'
import { hashPassword } from '../auth/password.js'
import { logger } from '../logger.js'
import { closeDb, db } from './client.js'
import { users } from './schema/index.js'

/**
 * The two personas from docs/PLAN.md. Profiles and targets arrive in slice 2; for now they
 * are accounts you can sign in with locally. Idempotent: existing emails are left alone.
 */
export const SEED_USERS = [
  { email: 'finn@example.com', password: 'finn-password' },
  { email: 'tess@example.com', password: 'tess-password' },
] as const

async function seed(): Promise<void> {
  for (const { email, password } of SEED_USERS) {
    const inserted = await db
      .insert(users)
      .values({ id: uuidv7(), email, passwordHash: await hashPassword(password) })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id })
    logger.info({ email, created: inserted.length > 0 }, 'seed user')
  }
}

try {
  await seed()
  await closeDb()
} catch (error) {
  logger.error({ err: error }, 'seed failed')
  await closeDb().catch(() => undefined)
  process.exit(1)
}
