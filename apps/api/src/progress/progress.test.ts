import {
  addDays,
  apiErrorSchema,
  applyRecalibrationResponseSchema,
  localDay,
  profileResponseSchema,
  recalibrationResponseSchema,
  snoozeRecalibrationResponseSchema,
  targetHistoryResponseSchema,
  targetValue,
  targetsResponseSchema,
  weightResponseSchema,
  weightsResponseSchema,
  type ProfileInput,
} from '@diet-tracker/shared'
import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { SESSION_COOKIE } from '../auth/session-service.js'
import { db } from '../db/client.js'
import { SEED_USERS } from '../db/seed-data.js'
import { backdateTargets, seedEarlierWeek, seedWeights } from '../db/seed-progress.js'
import { seedWeek } from '../db/seed-weeks.js'
import { resetRateLimits } from '../middleware/rate-limit.js'

const app = createApp()
const TZ = 'Europe/London'
const today = () => localDay(new Date(), TZ)

let cookie = ''
let userId = ''

function send(method: 'GET' | 'PUT' | 'POST' | 'DELETE', path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: {
      cookie,
      'x-forwarded-for': '203.0.113.9',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

async function signInAs(email: string, profile: ProfileInput): Promise<void> {
  const res = await app.request('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
    body: JSON.stringify({ email, password: 'tess-password' }),
  })
  const body = (await res.json()) as { user: { id: string } }
  userId = body.user.id
  cookie =
    res.headers
      .getSetCookie()
      .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
      ?.split(';')[0] ?? ''
  expect((await send('PUT', '/api/v1/profile', profile)).status).toBe(200)
}

const tess = SEED_USERS.find((u) => u.email === 'tess@example.com')!
const finn = SEED_USERS.find((u) => u.email === 'finn@example.com')!

beforeEach(async () => {
  resetRateLimits()
  await db.execute(
    sql`truncate table weekly_reviews, log_entries, daily_summaries, foods, ai_calls, weight_entries, target_versions, profiles, sessions, users cascade`,
  )
})

describe('weight', () => {
  beforeEach(() => signInAs(tess.email, tess.profile))

  it('lists the weigh-in from onboarding with the goal and the expected pace', async () => {
    const res = await send('GET', '/api/v1/weight')
    expect(res.status).toBe(200)
    const body = weightsResponseSchema.parse(await res.json())
    expect(body.today).toBe(today())
    expect(body.entries).toHaveLength(1)
    expect(body.entries[0]).toMatchObject({ day: today(), weightKg: 50 })
    expect(body.goalWeightKg).toBe(48)
    expect(body.expectedKgPerWeek).toBe(-0.25)
  })

  it('a newest weigh-in updates the profile weight but not the targets; older ones do not', async () => {
    const res = await send('PUT', '/api/v1/weight', { day: today(), weightKg: 49.55 })
    expect(res.status).toBe(200)
    const body = weightResponseSchema.parse(await res.json())
    expect(body.entry.weightKg).toBe(49.6)
    expect(body.profileWeightUpdated).toBe(true)

    const profile = profileResponseSchema.parse(await (await send('GET', '/api/v1/profile')).json())
    expect(profile.profile?.weightKg).toBe(49.6)
    const history = targetHistoryResponseSchema.parse(
      await (await send('GET', '/api/v1/targets/history')).json(),
    )
    expect(history.versions).toHaveLength(1)

    const older = weightResponseSchema.parse(
      await (
        await send('PUT', '/api/v1/weight', {
          day: addDays(today(), -3),
          weightKg: 51,
          note: 'holiday',
        })
      ).json(),
    )
    expect(older.profileWeightUpdated).toBe(false)
    expect(older.entry.note).toBe('holiday')

    const list = weightsResponseSchema.parse(await (await send('GET', '/api/v1/weight')).json())
    expect(list.entries.map((e) => e.weightKg)).toEqual([51, 49.6])
  })

  it('refuses a future day or an impossible weight', async () => {
    const future = await send('PUT', '/api/v1/weight', { day: addDays(today(), 1), weightKg: 50 })
    expect(future.status).toBe(400)
    expect(apiErrorSchema.parse(await future.json()).error.details).toMatchObject({
      fieldErrors: { day: ['That day has not happened yet'] },
    })
    const heavy = await send('PUT', '/api/v1/weight', { day: today(), weightKg: 900 })
    expect(heavy.status).toBe(400)
  })

  it('deletes a weigh-in', async () => {
    expect((await send('DELETE', `/api/v1/weight/${today()}`)).status).toBe(204)
    expect((await send('DELETE', `/api/v1/weight/${today()}`)).status).toBe(404)
    expect((await send('DELETE', '/api/v1/weight/not-a-day')).status).toBe(404)
    const list = weightsResponseSchema.parse(await (await send('GET', '/api/v1/weight')).json())
    expect(list.entries).toHaveLength(0)
  })
})

describe('recalibration', () => {
  it('is not due for two weeks after onboarding', async () => {
    await signInAs(tess.email, tess.profile)
    const res = await send('GET', '/api/v1/recalibration')
    expect(res.status).toBe(200)
    const { assessment } = recalibrationResponseSchema.parse(await res.json())
    expect(assessment.status).toBe('not_due')
    expect(assessment.dueOn).toBe(addDays(today(), 14))
    expect(assessment.proposal).toBeNull()

    const apply = await send('POST', '/api/v1/recalibration/apply', { expectedEnergyKcal: 1380 })
    expect(apply.status).toBe(409)
    expect(apiErrorSchema.parse(await apply.json()).error.code).toBe('conflict')
  })

  it('asks for data once due, then proposes a bounded, clamped cut for a stalled fortnight', async () => {
    await signInAs(tess.email, tess.profile)
    expect(await backdateTargets(userId, TZ)).toBe(true)

    const empty = recalibrationResponseSchema.parse(
      await (await send('GET', '/api/v1/recalibration')).json(),
    )
    expect(empty.assessment.status).toBe('not_enough_data')
    expect(empty.assessment.reason).toMatch(/log 10 more days/)

    expect(await seedWeek(userId, tess.email, TZ)).toBeGreaterThan(0)
    expect(await seedEarlierWeek(userId, tess.email, TZ)).toBeGreaterThan(0)
    expect(await seedEarlierWeek(userId, tess.email, TZ)).toBe(0)
    expect(await seedWeights(userId, tess.email, TZ)).toBe(8)

    const { assessment } = recalibrationResponseSchema.parse(
      await (await send('GET', '/api/v1/recalibration')).json(),
    )
    expect(assessment.status).toBe('proposal')
    expect(assessment.evidence.daysLogged).toBe(12)
    expect(assessment.evidence.weighIns).toBe(8)
    expect(assessment.evidence.actualKgPerWeek).toBe(0)
    expect(assessment.evidence.expectedKgPerWeek).toBe(-0.25)
    expect(assessment.evidence.averageIntakeKcal).toBe(1680)
    expect(assessment.proposal).toMatchObject({
      deltaKcal: -190,
      current: { energyKcal: 1570 },
      proposed: { energyKcal: 1380, proteinG: 100 },
      weightKg: 50,
    })
    expect(assessment.reason).toMatch(/losing less than planned/)

    const stale = await send('POST', '/api/v1/recalibration/apply', { expectedEnergyKcal: 1400 })
    expect(stale.status).toBe(409)

    const applied = await send('POST', '/api/v1/recalibration/apply', { expectedEnergyKcal: 1380 })
    expect(applied.status).toBe(200)
    const { version } = applyRecalibrationResponseSchema.parse(await applied.json())
    expect(version.trigger).toBe('recalibration')
    expect(version.effectiveFrom).toBe(today())
    expect(version.inputs.recalibrationKcal).toBe(-186)
    expect(targetValue(version.effective, 'energy_kcal')).toBe(1380)
    expect(version.effective.entries.find((e) => e.key === 'energy_kcal')?.reason).toMatch(
      /minus 186 kcal from recalibration/,
    )

    const current = targetsResponseSchema.parse(await (await send('GET', '/api/v1/targets')).json())
    expect(current.version.id).toBe(version.id)
    const history = targetHistoryResponseSchema.parse(
      await (await send('GET', '/api/v1/targets/history')).json(),
    )
    expect(history.versions.map((v) => v.trigger)).toEqual(['recalibration', 'onboarding'])

    const after = recalibrationResponseSchema.parse(
      await (await send('GET', '/api/v1/recalibration')).json(),
    )
    expect(after.assessment.status).toBe('not_due')
    expect(after.assessment.dueOn).toBe(addDays(today(), 14))

    // A later profile edit keeps the adjustment.
    const edited = await send('PUT', '/api/v1/profile', { ...tess.profile, dislikes: ['okra'] })
    expect(edited.status).toBe(200)
    const kept = targetsResponseSchema.parse(await (await send('GET', '/api/v1/targets')).json())
    expect(kept.version.inputs.recalibrationKcal).toBe(-186)
  })

  it("Finn gaining on schedule is on track, and 'not now' snoozes for two weeks", async () => {
    await signInAs(finn.email, finn.profile)
    await backdateTargets(userId, TZ)
    await seedWeek(userId, finn.email, TZ)
    await seedEarlierWeek(userId, finn.email, TZ)
    await seedWeights(userId, finn.email, TZ)

    const { assessment } = recalibrationResponseSchema.parse(
      await (await send('GET', '/api/v1/recalibration')).json(),
    )
    expect(assessment.status).toBe('on_track')
    expect(assessment.evidence.actualKgPerWeek).toBeGreaterThan(0.2)
    expect(assessment.evidence.actualKgPerWeek).toBeLessThan(0.4)

    const snoozed = snoozeRecalibrationResponseSchema.parse(
      await (await send('POST', '/api/v1/recalibration/snooze')).json(),
    )
    expect(snoozed.snoozedUntil).toBe(addDays(today(), 14))
    const after = recalibrationResponseSchema.parse(
      await (await send('GET', '/api/v1/recalibration')).json(),
    )
    expect(after.assessment.status).toBe('not_due')
    expect(after.assessment.snoozedUntil).toBe(addDays(today(), 14))
  })
})
