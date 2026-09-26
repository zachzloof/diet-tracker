import {
  RECALIBRATION,
  addDays,
  assessRecalibration,
  carryOverrides,
  computeTargets,
  localDay,
  targetValue,
  type Profile,
  type RecalibrationAssessment,
  type WeightPoint,
} from '@diet-tracker/shared'
import { and, asc, between, eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { db } from '../db/client.js'
import { profiles, targetVersions, weightEntries } from '../db/schema/index.js'
import { errors } from '../errors.js'
import { buildTargetInput } from '../profile/profile-service.js'
import { requireLatestVersion } from '../profile/targets-service.js'
import { scoreDays } from '../stats/stats-service.js'
import type { TargetVersionRow } from '../db/schema/index.js'

/**
 * Recalibration (slice 5, targets.md section 10). The API only gathers the context: the
 * version in force, the last 14 scored days and the weigh-ins in that window. The pure
 * `assessRecalibration` decides; applying writes a new `target_versions` row with the
 * trigger `recalibration` (D20).
 */

async function weighInsBetween(userId: string, start: string, end: string): Promise<WeightPoint[]> {
  const rows = await db
    .select({ day: weightEntries.day, weightKg: weightEntries.weightKg })
    .from(weightEntries)
    .where(and(eq(weightEntries.userId, userId), between(weightEntries.day, start, end)))
    .orderBy(asc(weightEntries.day))
  return rows
}

async function snoozedUntil(userId: string): Promise<string | null> {
  const row = (
    await db
      .select({ until: profiles.recalibrationSnoozedUntil })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1)
  )[0]
  return row?.until ?? null
}

export async function assess(
  userId: string,
  profile: Profile,
  now: Date = new Date(),
): Promise<{ assessment: RecalibrationAssessment; version: TargetVersionRow; today: string }> {
  const today = localDay(now, profile.timezone)
  const version = await requireLatestVersion(userId)
  const windowStart = addDays(today, -(RECALIBRATION.windowDays - 1))
  const window = Array.from({ length: RECALIBRATION.windowDays }, (_, i) => addDays(windowStart, i))
  const [scored, weights, snooze] = await Promise.all([
    scoreDays(userId, window),
    weighInsBetween(userId, windowStart, today),
    snoozedUntil(userId),
  ])
  const inputs = {
    ...buildTargetInput(profile, today),
    ...(version.inputs.recalibrationKcal !== undefined
      ? { recalibrationKcal: version.inputs.recalibrationKcal }
      : {}),
  }
  const assessment = assessRecalibration({
    today,
    effectiveFrom: version.effectiveFrom,
    snoozedUntil: snooze,
    inputs,
    overrides: version.overrides,
    current: version.effective,
    days: scored.days,
    weights,
  })
  return { assessment, version, today }
}

/**
 * Confirms the proposal the person saw. The assessment is recomputed, and if the proposed
 * energy no longer matches what they accepted (a new weigh-in or meal changed it) the
 * request is refused so nobody confirms a number they never read.
 */
export async function apply(
  userId: string,
  profile: Profile,
  expectedEnergyKcal: number,
  now: Date = new Date(),
): Promise<TargetVersionRow> {
  const { assessment, version, today } = await assess(userId, profile, now)
  const proposal = assessment.proposal
  if (assessment.status !== 'proposal' || !proposal) {
    throw errors.conflict('There is no change to apply right now.')
  }
  if (proposal.proposed.energyKcal !== expectedEnergyKcal) {
    throw errors.conflict('The numbers changed since you looked. Check the new proposal.')
  }
  const inputs = {
    ...buildTargetInput(profile, today),
    weightKg: proposal.weightKg,
    recalibrationKcal: proposal.recalibrationKcal,
  }
  const computed = computeTargets(inputs)
  const overrides = carryOverrides(computed, version.overrides)
  const effective = computeTargets(inputs, overrides)
  if (targetValue(effective, 'energy_kcal') !== expectedEnergyKcal) {
    throw errors.conflict('The numbers changed since you looked. Check the new proposal.')
  }
  return db.transaction(async (tx) => {
    const inserted = (
      await tx
        .insert(targetVersions)
        .values({
          id: uuidv7(),
          userId,
          effectiveFrom: today,
          trigger: 'recalibration',
          inputs,
          computed,
          overrides,
          effective,
          explanation: null,
          createdAt: now,
        })
        .returning()
    )[0]
    if (!inserted) throw new Error('target version insert returned no row')
    await tx
      .update(profiles)
      .set({ weightKg: proposal.weightKg, recalibrationSnoozedUntil: null, updatedAt: now })
      .where(eq(profiles.userId, userId))
    return inserted
  })
}

export async function snooze(
  userId: string,
  profile: Profile,
  now: Date = new Date(),
): Promise<string> {
  const until = addDays(localDay(now, profile.timezone), RECALIBRATION.snoozeDays)
  await db
    .update(profiles)
    .set({ recalibrationSnoozedUntil: until, updatedAt: now })
    .where(eq(profiles.userId, userId))
  return until
}
