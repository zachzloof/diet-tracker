import {
  ACCOUNT_EXPORT_SCHEMA_VERSION,
  FOOD_GROUP_KEYS,
  NUTRIENT_KEYS,
  accountExportSchema,
  type AccountExport,
} from '@diet-tracker/shared'
import { and, asc, eq, ne, sql } from 'drizzle-orm'
import { hashPassword, verifyPassword } from '../auth/password.js'
import { toPublicUser } from '../auth/session-service.js'
import { db } from '../db/client.js'
import {
  aiCalls,
  dailySummaries,
  foods,
  logEntries,
  sessions,
  targetVersions,
  users,
  weeklyReviews,
  type User,
} from '../db/schema/index.js'
import { errors } from '../errors.js'
import { toWireFood } from '../log/foods-service.js'
import { toWireEntry, toWireSummary } from '../log/log-service.js'
import { passwordAttemptLimiter } from '../middleware/rate-limit.js'
import { getProfile } from '../profile/profile-service.js'
import { toWireVersion } from '../profile/targets-service.js'
import { allWeights, toWireWeight } from '../progress/weight-service.js'

/**
 * Account housekeeping (slice 5): change password, export everything, delete everything.
 * Every user-owned table cascades from `users`, so deletion is one statement (db-schema
 * skill); the export lists every table so nothing is held that the person cannot see.
 */

async function requirePassword(user: User, password: string, field: string): Promise<void> {
  const retryAfter = passwordAttemptLimiter.retryAfter(user.id)
  if (retryAfter > 0) throw errors.rateLimited(retryAfter)
  const ok = await verifyPassword(user.passwordHash, password)
  if (!ok) {
    passwordAttemptLimiter.hit(user.id)
    throw errors.validation({
      fieldErrors: { [field]: ['That password is incorrect'] },
      formErrors: [],
    })
  }
  passwordAttemptLimiter.reset(user.id)
}

/** Sets a new password and signs out every other device. */
export async function changePassword(
  user: User,
  currentSessionId: string,
  currentPassword: string,
  newPassword: string,
  now: Date = new Date(),
): Promise<void> {
  await requirePassword(user, currentPassword, 'currentPassword')
  const passwordHash = await hashPassword(newPassword)
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, user.id))
    await tx
      .delete(sessions)
      .where(and(eq(sessions.userId, user.id), ne(sessions.id, currentSessionId)))
  })
}

/** Removes the account and, through the cascades, every row that references it. */
export async function deleteAccount(user: User, password: string): Promise<void> {
  await requirePassword(user, password, 'password')
  await db.delete(users).where(eq(users.id, user.id))
}

export async function exportAccount(user: User, now: Date = new Date()): Promise<AccountExport> {
  const [profile, versions, weights, library, entries, summaries, reviews, usage] =
    await Promise.all([
      getProfile(user.id),
      db
        .select()
        .from(targetVersions)
        .where(eq(targetVersions.userId, user.id))
        .orderBy(asc(targetVersions.effectiveFrom), asc(targetVersions.createdAt)),
      allWeights(user.id),
      db.select().from(foods).where(eq(foods.userId, user.id)).orderBy(asc(foods.createdAt)),
      db
        .select()
        .from(logEntries)
        .where(eq(logEntries.userId, user.id))
        .orderBy(asc(logEntries.day), asc(logEntries.loggedAt), asc(logEntries.createdAt)),
      db
        .select()
        .from(dailySummaries)
        .where(eq(dailySummaries.userId, user.id))
        .orderBy(asc(dailySummaries.day)),
      db
        .select()
        .from(weeklyReviews)
        .where(eq(weeklyReviews.userId, user.id))
        .orderBy(asc(weeklyReviews.weekEnd)),
      db
        .select({
          calls: sql<number>`count(*)::int`,
          inputTokens: sql<number>`coalesce(sum(${aiCalls.inputTokens}), 0)::int`,
          outputTokens: sql<number>`coalesce(sum(${aiCalls.outputTokens}), 0)::int`,
          webSearchCalls: sql<number>`coalesce(sum(${aiCalls.webSearchCalls}), 0)::int`,
        })
        .from(aiCalls)
        .where(eq(aiCalls.userId, user.id)),
    ])
  const ai = usage[0] ?? { calls: 0, inputTokens: 0, outputTokens: 0, webSearchCalls: 0 }
  return accountExportSchema.parse({
    exportedAt: now.toISOString(),
    app: { name: 'diet-tracker', version: APP_VERSION, schema: ACCOUNT_EXPORT_SCHEMA_VERSION },
    user: toPublicUser(user),
    profile,
    targetVersions: versions.map(toWireVersion),
    weightEntries: weights.map(toWireWeight),
    foods: library.map(toWireFood),
    logEntries: entries.map(toWireEntry),
    dailySummaries: summaries.map((row) => toWireSummary(row, row.day)),
    weeklyReviews: reviews.map((row) => ({ isoWeek: row.isoWeek, ...row.review })),
    aiUsage: ai,
  })
}

const APP_VERSION = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev'

/** RFC 4180: quote when needed, double the quotes inside. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = value instanceof Date ? value.toISOString() : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function csvRows(rows: readonly (readonly unknown[])[]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/** One row per log entry, every nutrient and food group as its own column. */
export function logEntriesCsv(data: AccountExport): string {
  const header = [
    'day',
    'logged_at',
    'meal',
    'name',
    'quantity',
    'unit',
    'grams',
    'source',
    'confidence',
    ...NUTRIENT_KEYS,
    ...FOOD_GROUP_KEYS,
    'assumptions',
  ]
  const rows = data.logEntries.map((entry) => [
    entry.day,
    entry.loggedAt,
    entry.meal,
    entry.name,
    entry.quantity,
    entry.unit,
    entry.grams,
    entry.source,
    entry.confidence ?? '',
    ...NUTRIENT_KEYS.map((key) => entry.nutrients[key]),
    ...FOOD_GROUP_KEYS.map((key) => entry.foodGroups[key]),
    entry.assumptions.join(' | '),
  ])
  return csvRows([header, ...rows])
}

export function weightsCsv(data: AccountExport): string {
  const rows = data.weightEntries.map((entry) => [entry.day, entry.weightKg, entry.note ?? ''])
  return csvRows([['day', 'weight_kg', 'note'], ...rows])
}
