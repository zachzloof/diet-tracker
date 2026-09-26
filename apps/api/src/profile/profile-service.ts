import {
  MIN_AGE,
  ageOn,
  carryOverrides,
  computeTargets,
  localDay,
  profileSchema,
  type Overrides,
  type Profile,
  type ProfileInput,
  type TargetInput,
  type TargetTrigger,
} from '@diet-tracker/shared'
import { eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { db } from '../db/client.js'
import {
  profiles,
  targetVersions,
  weightEntries,
  type ProfileRow,
  type TargetVersionRow,
} from '../db/schema/index.js'
import { errors } from '../errors.js'
import { latestVersion, type Tx } from './targets-service.js'

export function toWireProfile(row: ProfileRow): Profile {
  return profileSchema.parse({
    sex: row.sex,
    dob: row.dob,
    heightCm: row.heightCm,
    weightKg: row.weightKg,
    bodyFatPct: row.bodyFatPct,
    goal: row.goal,
    pace: row.pace,
    goalWeightKg: row.goalWeightKg,
    activity: row.activity,
    trainingType: row.trainingType,
    trainingDaysPerWeek: row.trainingDays,
    dietPattern: row.dietPattern,
    allergies: row.allergies,
    dislikes: row.dislikes,
    timezone: row.timezone,
    units: row.units,
    flags: row.flags,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
}

/** The engine input for a profile on a given local day (age is derived here, never inside the engine). */
export function buildTargetInput(profile: ProfileInput, today: string): TargetInput {
  return {
    sex: profile.sex,
    age: ageOn(profile.dob, today),
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    bodyFatPct: profile.bodyFatPct,
    activity: profile.activity,
    trainingType: profile.trainingType,
    trainingDaysPerWeek: profile.trainingDaysPerWeek,
    goal: profile.goal,
    pace: profile.pace,
    goalWeightKg: profile.goalWeightKg,
    dietPattern: profile.dietPattern,
    flags: profile.flags,
  }
}

/** JSONB does not keep key order, so compare on a key-sorted serialisation. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const rows = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1)
  const row = rows[0]
  return row ? toWireProfile(row) : null
}

export interface SaveProfileResult {
  profile: Profile
  version: TargetVersionRow
  targetsChanged: boolean
}

/**
 * Creates or updates the profile and, when the engine inputs changed, inserts a new
 * target version (history is kept). Overrides that are still safe carry forward. A
 * changed weight is also recorded as today's weight entry.
 */
export async function saveProfile(
  userId: string,
  input: ProfileInput,
  now: Date = new Date(),
): Promise<SaveProfileResult> {
  const today = localDay(now, input.timezone)
  if (ageOn(input.dob, today) < MIN_AGE) {
    throw errors.validation({
      fieldErrors: { dob: [`You need to be ${MIN_AGE} or over to use this app`] },
      formErrors: [],
    })
  }

  return db.transaction(async (tx) => {
    const existing = (
      await tx.select().from(profiles).where(eq(profiles.userId, userId)).limit(1)
    )[0]

    const values = {
      sex: input.sex,
      dob: input.dob,
      heightCm: input.heightCm,
      weightKg: input.weightKg,
      bodyFatPct: input.bodyFatPct,
      goal: input.goal,
      pace: input.pace,
      goalWeightKg: input.goalWeightKg,
      activity: input.activity,
      trainingType: input.trainingType,
      trainingDays: input.trainingDaysPerWeek,
      dietPattern: input.dietPattern,
      allergies: input.allergies,
      dislikes: input.dislikes,
      timezone: input.timezone,
      units: input.units,
      flags: input.flags,
      updatedAt: now,
    }
    const saved = (
      await tx
        .insert(profiles)
        .values({ userId, ...values, createdAt: now })
        .onConflictDoUpdate({ target: profiles.userId, set: values })
        .returning()
    )[0]
    if (!saved) throw new Error('profile upsert returned no row')

    const current = await latestVersion(userId, tx)
    // A recalibration adjustment survives profile edits; only the next recalibration replaces it.
    const targetInput: TargetInput = {
      ...buildTargetInput(input, today),
      ...(current?.inputs.recalibrationKcal !== undefined
        ? { recalibrationKcal: current.inputs.recalibrationKcal }
        : {}),
    }
    let version = current
    let targetsChanged = false

    if (!current || stableStringify(current.inputs) !== stableStringify(targetInput)) {
      const trigger: TargetTrigger = current ? 'profile_change' : 'onboarding'
      const computed = computeTargets(targetInput)
      const overrides: Overrides = current ? carryOverrides(computed, current.overrides) : {}
      const effective = computeTargets(targetInput, overrides)
      version = await insertVersion(tx, {
        userId,
        effectiveFrom: today,
        trigger,
        inputs: targetInput,
        computed,
        overrides,
        effective,
        createdAt: now,
      })
      targetsChanged = true
    }
    if (!version) throw new Error('no target version after save')

    if (!existing || existing.weightKg !== input.weightKg) {
      await tx
        .insert(weightEntries)
        .values({ id: uuidv7(), userId, day: today, weightKg: input.weightKg, createdAt: now })
        .onConflictDoUpdate({
          target: [weightEntries.userId, weightEntries.day],
          set: { weightKg: input.weightKg },
        })
    }

    return { profile: toWireProfile(saved), version, targetsChanged }
  })
}

interface InsertVersion {
  userId: string
  effectiveFrom: string
  trigger: TargetTrigger
  inputs: TargetInput
  computed: ReturnType<typeof computeTargets>
  overrides: Overrides
  effective: ReturnType<typeof computeTargets>
  createdAt: Date
}

async function insertVersion(tx: Tx, row: InsertVersion) {
  const inserted = await tx
    .insert(targetVersions)
    .values({ id: uuidv7(), explanation: null, ...row })
    .returning()
  const version = inserted[0]
  if (!version) throw new Error('target version insert returned no row')
  return version
}
