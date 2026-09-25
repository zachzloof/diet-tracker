import {
  checkOverride,
  computeTargets,
  targetFor,
  targetValue,
  targetVersionSchema,
  type OverrideWarning,
  type Overrides,
  type OverridesInput,
  type TargetHistoryItem,
  type TargetKey,
  type TargetVersion,
} from '@diet-tracker/shared'
import { and, desc, eq } from 'drizzle-orm'
import { db, type Db } from '../db/client.js'
import { targetVersions, type TargetVersionRow } from '../db/schema/index.js'
import { errors } from '../errors.js'

export type Tx = Db | Parameters<Parameters<Db['transaction']>[0]>[0]

/** The version in force: latest `effective_from`, then latest `created_at`. */
export async function latestVersion(userId: string, tx: Tx = db): Promise<TargetVersionRow | null> {
  const rows = await tx
    .select()
    .from(targetVersions)
    .where(eq(targetVersions.userId, userId))
    .orderBy(desc(targetVersions.effectiveFrom), desc(targetVersions.createdAt))
    .limit(1)
  return rows[0] ?? null
}

export async function requireLatestVersion(userId: string): Promise<TargetVersionRow> {
  const version = await latestVersion(userId)
  if (!version) throw errors.profileRequired()
  return version
}

/** Validates the JSONB on the way out so a stray shape never reaches the browser. */
export function toWireVersion(row: TargetVersionRow): TargetVersion {
  return targetVersionSchema.parse({
    id: row.id,
    effectiveFrom: row.effectiveFrom,
    trigger: row.trigger,
    inputs: row.inputs,
    computed: row.computed,
    overrides: row.overrides,
    effective: row.effective,
    explanation: row.explanation,
    createdAt: row.createdAt.toISOString(),
  })
}

export async function listVersions(userId: string): Promise<TargetHistoryItem[]> {
  const rows = await db
    .select()
    .from(targetVersions)
    .where(eq(targetVersions.userId, userId))
    .orderBy(desc(targetVersions.effectiveFrom), desc(targetVersions.createdAt))
    .limit(100)
  return rows.map((row) => ({
    id: row.id,
    effectiveFrom: row.effectiveFrom,
    trigger: row.trigger,
    createdAt: row.createdAt.toISOString(),
    weightKg: row.inputs.weightKg,
    goal: row.effective.meta.goalApplied,
    energyKcal: targetValue(row.effective, 'energy_kcal'),
    proteinG: targetValue(row.effective, 'protein_g'),
    carbsG: targetValue(row.effective, 'carbs_g'),
    fatG: targetValue(row.effective, 'fat_g'),
    overrideCount: Object.keys(row.overrides).length,
  }))
}

/**
 * Applies an override patch to the current version in place. Values inside the range are
 * silent, outside it come back as warnings, below a floor are refused unless `confirm`.
 * Changing overrides drops the cached explanation so it can never contradict the numbers.
 */
export async function setOverrides(
  userId: string,
  patch: OverridesInput,
): Promise<{ version: TargetVersionRow; warnings: OverrideWarning[] }> {
  const current = await requireLatestVersion(userId)
  const next: Overrides = { ...current.overrides }
  const warnings: OverrideWarning[] = []
  const blocked: OverrideWarning[] = []

  for (const [rawKey, value] of Object.entries(patch.overrides)) {
    const key = rawKey as TargetKey
    if (value === null || value === undefined) {
      delete next[key]
      continue
    }
    const entry = targetFor(current.computed, key)
    if (!entry) {
      throw errors.validation({
        fieldErrors: { [key]: ['That target cannot be overridden'] },
        formErrors: [],
      })
    }
    const check = checkOverride(entry, value)
    if (check.level === 'blocked') {
      blocked.push({ key, level: 'blocked', message: check.message ?? '' })
    } else if (check.level === 'warning') {
      warnings.push({ key, level: 'warning', message: check.message ?? '' })
    }
    next[key] = value
  }

  if (blocked.length > 0 && !patch.confirm) throw errors.overrideBlocked(blocked)
  warnings.push(...blocked)

  const effective = computeTargets(current.inputs, next)
  const updated = (
    await db
      .update(targetVersions)
      .set({ overrides: next, effective, explanation: null })
      .where(and(eq(targetVersions.id, current.id), eq(targetVersions.userId, userId)))
      .returning()
  )[0]
  if (!updated) throw errors.notFound()
  return { version: updated, warnings }
}
