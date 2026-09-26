import {
  NO_FLAGS,
  apiErrorSchema,
  overridesResponseSchema,
  profileResponseSchema,
  profileSaveResponseSchema,
  targetHistoryResponseSchema,
  targetValue,
  targetsResponseSchema,
  type ProfileInput,
} from '@diet-tracker/shared'
import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { SESSION_COOKIE } from '../auth/session-service.js'
import { db } from '../db/client.js'
import { targetVersions, weightEntries } from '../db/schema/index.js'
import { resetRateLimits } from '../middleware/rate-limit.js'

const app = createApp()

/** Finn as the onboarding form would send him; dob keeps him 28 through mid-2027. */
const finn: ProfileInput = {
  sex: 'male',
  dob: '1998-06-15',
  heightCm: 178,
  weightKg: 75,
  bodyFatPct: null,
  goal: 'gain',
  pace: 'lean',
  goalWeightKg: 80,
  activity: 'high',
  trainingType: 'combat',
  trainingDaysPerWeek: 6,
  dietPattern: 'omnivore',
  allergies: [],
  dislikes: [],
  timezone: 'Europe/London',
  units: 'metric',
  flags: NO_FLAGS,
}

let cookie = ''

function send(method: 'GET' | 'PUT' | 'PATCH' | 'POST', path: string, body?: unknown) {
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

async function errorBody(res: Response) {
  return apiErrorSchema.parse(await res.json()).error
}

beforeEach(async () => {
  resetRateLimits()
  await db.execute(
    sql`truncate table log_entries, daily_summaries, foods, ai_calls, weight_entries, target_versions, profiles, sessions, users cascade`,
  )
  const res = await app.request('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
    body: JSON.stringify({ email: 'finn@example.com', password: 'finn-password' }),
  })
  cookie =
    res.headers
      .getSetCookie()
      .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
      ?.split(';')[0] ?? ''
})

describe('profile', () => {
  it('is null before onboarding and targets answer profile_required', async () => {
    const res = await send('GET', '/api/v1/profile')
    expect(res.status).toBe(200)
    expect(profileResponseSchema.parse(await res.json()).profile).toBeNull()

    const targets = await send('GET', '/api/v1/targets')
    expect(targets.status).toBe(409)
    expect((await errorBody(targets)).code).toBe('profile_required')
  })

  it('needs a session', async () => {
    cookie = ''
    const res = await send('PUT', '/api/v1/profile', finn)
    expect(res.status).toBe(401)
  })

  it('onboarding saves the profile and computes the golden targets', async () => {
    const res = await send('PUT', '/api/v1/profile', finn)
    expect(res.status).toBe(200)
    const body = profileSaveResponseSchema.parse(await res.json())
    expect(body.targetsChanged).toBe(true)
    expect(body.profile.weightKg).toBe(75)
    expect(body.version.trigger).toBe('onboarding')
    expect(body.version.inputs.age).toBe(28)
    expect(targetValue(body.version.effective, 'energy_kcal')).toBe(3250)
    expect(targetValue(body.version.effective, 'protein_g')).toBe(150)
    expect(targetValue(body.version.effective, 'carbs_g')).toBe(460)
    expect(targetValue(body.version.effective, 'fat_g')).toBe(90)
    expect(body.version.overrides).toEqual({})
    expect(body.version.explanation).toBeNull()

    const fetched = await send('GET', '/api/v1/profile')
    expect(profileResponseSchema.parse(await fetched.json()).profile?.goal).toBe('gain')

    const targets = await send('GET', '/api/v1/targets')
    expect(targetsResponseSchema.parse(await targets.json()).version.id).toBe(body.version.id)

    const weights = await db.select().from(weightEntries)
    expect(weights).toHaveLength(1)
    expect(weights[0]?.weightKg).toBe(75)
  })

  it('rejects an under-18 date of birth and a pace that does not fit the goal', async () => {
    const young = await send('PUT', '/api/v1/profile', { ...finn, dob: '2012-01-01' })
    expect(young.status).toBe(400)
    const error = await errorBody(young)
    expect(error.details).toMatchObject({
      fieldErrors: { dob: ['You need to be 18 or over to use this app'] },
    })

    const badPace = await send('PUT', '/api/v1/profile', { ...finn, pace: 'gentle' })
    expect(badPace.status).toBe(400)
    expect((await errorBody(badPace)).details).toMatchObject({
      fieldErrors: { pace: ['Choose a pace for this goal'] },
    })
  })

  it('saving unchanged inputs keeps the version; changing weight adds one and keeps history', async () => {
    const first = profileSaveResponseSchema.parse(
      await (await send('PUT', '/api/v1/profile', finn)).json(),
    )

    const same = profileSaveResponseSchema.parse(
      await (await send('PUT', '/api/v1/profile', { ...finn, dislikes: ['liver'] })).json(),
    )
    expect(same.targetsChanged).toBe(false)
    expect(same.version.id).toBe(first.version.id)
    expect(same.profile.dislikes).toEqual(['liver'])

    const heavier = profileSaveResponseSchema.parse(
      await (await send('PUT', '/api/v1/profile', { ...finn, weightKg: 77 })).json(),
    )
    expect(heavier.targetsChanged).toBe(true)
    expect(heavier.version.id).not.toBe(first.version.id)
    expect(heavier.version.trigger).toBe('profile_change')
    expect(targetValue(heavier.version.effective, 'energy_kcal')).toBe(3290)

    const history = targetHistoryResponseSchema.parse(
      await (await send('GET', '/api/v1/targets/history')).json(),
    )
    expect(history.versions).toHaveLength(2)
    expect(history.versions[0]?.id).toBe(heavier.version.id)
    expect(history.versions[1]?.id).toBe(first.version.id)
    expect(history.versions[1]?.weightKg).toBe(75)
    expect(history.versions[1]?.energyKcal).toBe(3250)
    expect(await db.select().from(targetVersions)).toHaveLength(2)
  })
})

describe('overrides', () => {
  beforeEach(async () => {
    await send('PUT', '/api/v1/profile', finn)
  })

  it('protein 180 g is accepted with a warning and sticks on the next read', async () => {
    const res = await send('PATCH', '/api/v1/targets/overrides', { overrides: { protein_g: 180 } })
    expect(res.status).toBe(200)
    const body = overridesResponseSchema.parse(await res.json())
    expect(body.warnings).toEqual([
      {
        key: 'protein_g',
        level: 'warning',
        message: expect.stringMatching(/above the usual range/),
      },
    ])
    expect(targetValue(body.version.effective, 'protein_g')).toBe(180)
    expect(targetValue(body.version.effective, 'carbs_g')).toBe(430)
    expect(targetValue(body.version.computed, 'protein_g')).toBe(150)

    const again = targetsResponseSchema.parse(await (await send('GET', '/api/v1/targets')).json())
    expect(again.version.overrides).toEqual({ protein_g: 180 })
    expect(targetValue(again.version.effective, 'protein_g')).toBe(180)
  })

  it('energy below the floor is refused until confirmed', async () => {
    const refused = await send('PATCH', '/api/v1/targets/overrides', {
      overrides: { energy_kcal: 1500 },
    })
    expect(refused.status).toBe(422)
    const error = await errorBody(refused)
    expect(error.code).toBe('override_blocked')
    expect(error.details).toMatchObject({
      blocked: [{ key: 'energy_kcal', level: 'blocked' }],
    })

    const confirmed = await send('PATCH', '/api/v1/targets/overrides', {
      overrides: { energy_kcal: 1500 },
      confirm: true,
    })
    expect(confirmed.status).toBe(200)
    const body = overridesResponseSchema.parse(await confirmed.json())
    expect(body.warnings[0]?.level).toBe('blocked')
    expect(targetValue(body.version.effective, 'energy_kcal')).toBe(1500)
  })

  it('null removes an override, and safe overrides carry across a profile change', async () => {
    await send('PATCH', '/api/v1/targets/overrides', {
      overrides: { protein_g: 160, vegetables: 8 },
    })
    const removed = overridesResponseSchema.parse(
      await (
        await send('PATCH', '/api/v1/targets/overrides', { overrides: { vegetables: null } })
      ).json(),
    )
    expect(removed.version.overrides).toEqual({ protein_g: 160 })

    const changed = profileSaveResponseSchema.parse(
      await (await send('PUT', '/api/v1/profile', { ...finn, weightKg: 77 })).json(),
    )
    expect(changed.version.overrides).toEqual({ protein_g: 160 })
    expect(targetValue(changed.version.effective, 'protein_g')).toBe(160)
  })

  it('rejects an unknown key and a negative value', async () => {
    const unknown = await send('PATCH', '/api/v1/targets/overrides', { overrides: { sugar_g: 10 } })
    expect(unknown.status).toBe(400)
    const negative = await send('PATCH', '/api/v1/targets/overrides', { overrides: { fat_g: -5 } })
    expect(negative.status).toBe(400)
  })
})

describe('POST /api/v1/targets/explain', () => {
  it('answers ai_unavailable without an OpenAI key and leaves the targets untouched', async () => {
    await send('PUT', '/api/v1/profile', finn)
    const res = await send('POST', '/api/v1/targets/explain')
    expect(res.status).toBe(503)
    const error = await errorBody(res)
    expect(error.code).toBe('ai_unavailable')
    expect(error.message).toMatch(/unavailable right now/)
    const targets = targetsResponseSchema.parse(await (await send('GET', '/api/v1/targets')).json())
    expect(targets.version.explanation).toBeNull()
  })
})
