import { addDays, localDay } from '@diet-tracker/shared'
import { and, eq, lte } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { createEntries } from '../log/log-service.js'
import { db } from './client.js'
import { logEntries, targetVersions, weightEntries } from './schema/index.js'
import { SEED_WEEKS, entryFor } from './seed-weeks.js'

/**
 * Slice 5 seed: enough history for recalibration (targets.md section 10) to have an
 * opinion. The week before the seed week repeats the same meals (offsets -13 to -8 mirror
 * -6 to -1), the first target version is backdated two weeks so the check is due, and a
 * fortnight of weigh-ins is added:
 *
 * - Tess is on a gentle loss (0.25 kg a week) but her weight is flat around 50 kg, so the
 *   check proposes eating less: 275 kcal by the formula, bounded to 200, then the 25%
 *   deficit clamp holds energy at 1380 kcal (a change of -190).
 * - Finn wants a lean gain of 0.25 kg a week and is gaining about 0.3, which is inside the
 *   0.15 tolerance, so his check says on track.
 */

const SEED_WEIGHTS: Record<string, { offset: number; weightKg: number }[]> = {
  'finn@example.com': [
    { offset: -13, weightKg: 74.4 },
    { offset: -11, weightKg: 74.5 },
    { offset: -9, weightKg: 74.6 },
    { offset: -7, weightKg: 74.7 },
    { offset: -5, weightKg: 74.8 },
    { offset: -3, weightKg: 74.9 },
    { offset: -1, weightKg: 75.0 },
    { offset: 0, weightKg: 75.1 },
  ],
  'tess@example.com': [
    { offset: -13, weightKg: 50.0 },
    { offset: -11, weightKg: 50.1 },
    { offset: -9, weightKg: 49.9 },
    { offset: -7, weightKg: 50.1 },
    { offset: -5, weightKg: 49.9 },
    { offset: -3, weightKg: 50.1 },
    { offset: -1, weightKg: 50.0 },
    { offset: 0, weightKg: 50.0 },
  ],
}

/** The seed week shifted back seven days, skipping today's partial breakfast. Idempotent. */
export async function seedEarlierWeek(
  userId: string,
  email: string,
  timeZone: string,
  now: Date = new Date(),
): Promise<number> {
  const today = localDay(now, timeZone)
  const existing = await db
    .select({ id: logEntries.id })
    .from(logEntries)
    .where(and(eq(logEntries.userId, userId), lte(logEntries.day, addDays(today, -7))))
    .limit(1)
  if (existing.length > 0) return 0

  let count = 0
  for (const { offset, items } of SEED_WEEKS[email] ?? []) {
    if (offset === 0) continue
    const day = addDays(today, offset - 7)
    for (const i of items) {
      const loggedAt = new Date(`${day}T${String(i.hour).padStart(2, '0')}:00:00Z`)
      await createEntries(
        userId,
        { day, meal: i.meal, loggedAt: loggedAt.toISOString(), entries: [entryFor(email, i.key)] },
        loggedAt,
      )
      count += 1
    }
  }
  return count
}

/** Two weeks of weigh-ins. Re-running overwrites the same days, so it is safe to repeat. */
export async function seedWeights(
  userId: string,
  email: string,
  timeZone: string,
  now: Date = new Date(),
): Promise<number> {
  const today = localDay(now, timeZone)
  const points = SEED_WEIGHTS[email] ?? []
  for (const { offset, weightKg } of points) {
    await db
      .insert(weightEntries)
      .values({ id: uuidv7(), userId, day: addDays(today, offset), weightKg, createdAt: now })
      .onConflictDoUpdate({
        target: [weightEntries.userId, weightEntries.day],
        set: { weightKg },
      })
  }
  return points.length
}

/** Moves the person's only target version back two weeks so recalibration is due today. */
export async function backdateTargets(
  userId: string,
  timeZone: string,
  now: Date = new Date(),
): Promise<boolean> {
  const versions = await db
    .select({ id: targetVersions.id, effectiveFrom: targetVersions.effectiveFrom })
    .from(targetVersions)
    .where(eq(targetVersions.userId, userId))
  const only = versions[0]
  if (!only || versions.length !== 1) return false
  const today = localDay(now, timeZone)
  const target = addDays(today, -14)
  if (only.effectiveFrom <= target) return false
  await db
    .update(targetVersions)
    .set({ effectiveFrom: target })
    .where(eq(targetVersions.id, only.id))
  return true
}
