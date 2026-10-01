import {
  RETENTION_DAYS,
  addDays,
  emptyFoodGroupServes,
  emptyNutrientVector,
} from '@diet-tracker/shared'
import { eq, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { hashPassword } from '../auth/password.js'
import { db } from '../db/client.js'
import { SEED_USERS } from '../db/seed-data.js'
import {
  aiCalls,
  dailySummaries,
  foods,
  logEntries,
  profiles,
  targetVersions,
  users,
  weeklyReviews,
  weightEntries,
} from '../db/schema/index.js'
import { saveProfile } from '../profile/profile-service.js'
import { purgeExpiredData } from './retention.js'

const NOW = new Date('2026-10-01T12:00:00.000Z')
const TODAY = '2026-10-01'
const CUTOFF = addDays(TODAY, -RETENTION_DAYS)
const OLD = addDays(CUTOFF, -1)
const tess = SEED_USERS.find((u) => u.email === 'tess@example.com')!

let userId = ''

async function logEntry(day: string): Promise<void> {
  await db.insert(logEntries).values({
    id: uuidv7(),
    userId,
    day,
    loggedAt: new Date(`${day}T12:00:00.000Z`),
    meal: 'lunch',
    name: 'Rice',
    quantity: 100,
    unit: 'g',
    grams: 100,
    nutrients: emptyNutrientVector(),
    foodGroups: emptyFoodGroupServes(),
    source: 'manual',
  })
  await db.insert(dailySummaries).values({
    id: uuidv7(),
    userId,
    day,
    totals: emptyNutrientVector(),
    foodGroups: emptyFoodGroupServes(),
    entryCount: 1,
  })
}

beforeEach(async () => {
  await db.execute(
    sql`truncate table weekly_reviews, log_entries, daily_summaries, foods, ai_calls, weight_entries, target_versions, profiles, sessions, users cascade`,
  )
  userId = uuidv7()
  await db
    .insert(users)
    .values({ id: userId, email: tess.email, passwordHash: await hashPassword(tess.password) })
})

describe('purgeExpiredData', () => {
  it('deletes dated history older than the retention period and keeps the rest', async () => {
    // A profile made long ago, changed once before the cutoff and once after it.
    const longAgo = new Date(`${addDays(CUTOFF, -60)}T12:00:00.000Z`)
    await saveProfile(userId, tess.profile, longAgo)
    await saveProfile(
      userId,
      { ...tess.profile, weightKg: tess.profile.weightKg - 2 },
      new Date(`${addDays(CUTOFF, -30)}T12:00:00.000Z`),
    )
    await saveProfile(
      userId,
      { ...tess.profile, weightKg: tess.profile.weightKg - 4 },
      new Date(`${addDays(CUTOFF, 30)}T12:00:00.000Z`),
    )

    await logEntry(OLD)
    await logEntry(CUTOFF)
    await logEntry(TODAY)
    for (const createdAt of [new Date(`${OLD}T23:00:00.000Z`), NOW]) {
      await db.insert(aiCalls).values({
        id: uuidv7(),
        userId,
        purpose: 'estimate',
        model: 'test',
        latencyMs: 1,
        ok: true,
        createdAt,
      })
    }
    await db.insert(foods).values({
      id: uuidv7(),
      userId,
      name: 'Rice',
      basis: 'per_100g',
      nutrients: emptyNutrientVector(),
      foodGroups: emptyFoodGroupServes(),
      source: 'manual',
      createdAt: longAgo,
    })

    const result = await purgeExpiredData(NOW)
    expect(result.cutoffDay).toBe(CUTOFF)
    expect(result).toMatchObject({ logEntries: 1, dailySummaries: 1, aiCalls: 1 })

    const days = (await db.select({ day: logEntries.day }).from(logEntries)).map((r) => r.day)
    expect(days.sort()).toEqual([CUTOFF, TODAY])
    expect(await db.select().from(dailySummaries)).toHaveLength(2)
    expect(await db.select().from(aiCalls)).toHaveLength(1)

    // The two weigh-ins from before the cutoff go; the one after stays.
    const weights = await db.select({ day: weightEntries.day }).from(weightEntries)
    expect(weights.map((w) => w.day)).toEqual([addDays(CUTOFF, 30)])

    // The first version was replaced before the cutoff and goes. The second was still in
    // force at the cutoff, so days that are kept can still be scored against it.
    const versions = await db
      .select({ from: targetVersions.effectiveFrom })
      .from(targetVersions)
      .orderBy(targetVersions.effectiveFrom)
    expect(versions.map((v) => v.from)).toEqual([addDays(CUTOFF, -30), addDays(CUTOFF, 30)])
    expect(result.targetVersions).toBe(1)

    // Not history: the account, the profile and the saved foods are untouched.
    expect(await db.select().from(foods)).toHaveLength(1)
    expect(await db.select().from(profiles).where(eq(profiles.userId, userId))).toHaveLength(1)
    expect(await db.select().from(weeklyReviews)).toHaveLength(0)

    // Running it again finds nothing.
    const again = await purgeExpiredData(NOW)
    expect(again).toMatchObject({ logEntries: 0, weightEntries: 0, targetVersions: 0, aiCalls: 0 })
  })

  it('never removes the only target version, however old', async () => {
    await saveProfile(userId, tess.profile, new Date(`${addDays(CUTOFF, -200)}T12:00:00.000Z`))
    const result = await purgeExpiredData(NOW)
    expect(result.targetVersions).toBe(0)
    expect(await db.select().from(targetVersions)).toHaveLength(1)
  })
})
