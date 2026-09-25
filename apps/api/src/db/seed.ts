import { targetValue } from '@diet-tracker/shared'
import { eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { hashPassword } from '../auth/password.js'
import { logger } from '../logger.js'
import { saveProfile } from '../profile/profile-service.js'
import { closeDb, db } from './client.js'
import { profiles, users } from './schema/index.js'
import { SEED_USERS } from './seed-data.js'

/**
 * Creates Finn and Tess with their profiles and first target version. Idempotent: existing
 * accounts and profiles are left alone, so re-running never overwrites a change you made
 * by hand in the app.
 */
async function seed(): Promise<void> {
  for (const { email, password, profile } of SEED_USERS) {
    const inserted = await db
      .insert(users)
      .values({ id: uuidv7(), email, passwordHash: await hashPassword(password) })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id })
    const user =
      inserted[0] ??
      (await db.select({ id: users.id }).from(users).where(eq(users.email, email)))[0]
    if (!user) throw new Error(`seed user ${email} missing after insert`)
    logger.info({ email, created: inserted.length > 0 }, 'seed user')

    const existing = await db
      .select({ userId: profiles.userId })
      .from(profiles)
      .where(eq(profiles.userId, user.id))
    if (existing.length > 0) {
      logger.info({ email }, 'seed profile already present, left alone')
      continue
    }
    const result = await saveProfile(user.id, profile)
    logger.info(
      {
        email,
        energyKcal: targetValue(result.version.effective, 'energy_kcal'),
        proteinG: targetValue(result.version.effective, 'protein_g'),
      },
      'seed profile and targets',
    )
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
