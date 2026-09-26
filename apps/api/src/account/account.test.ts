import {
  accountExportSchema,
  apiErrorSchema,
  localDay,
  type ProfileInput,
} from '@diet-tracker/shared'
import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { SESSION_COOKIE } from '../auth/session-service.js'
import { db } from '../db/client.js'
import { SEED_FOODS, SEED_USERS } from '../db/seed-data.js'
import { seedWeights } from '../db/seed-progress.js'
import { seedWeek } from '../db/seed-weeks.js'
import {
  dailySummaries,
  foods,
  logEntries,
  profiles,
  sessions,
  targetVersions,
  users,
  weightEntries,
} from '../db/schema/index.js'
import { resetRateLimits } from '../middleware/rate-limit.js'

const app = createApp()
const TZ = 'Europe/London'
const IP = '203.0.113.9'

let cookie = ''
let userId = ''

function send(method: 'GET' | 'PUT' | 'POST' | 'DELETE', path: string, body?: unknown, c = cookie) {
  return app.request(path, {
    method,
    headers: {
      cookie: c,
      'x-forwarded-for': IP,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function cookieOf(res: Response): string {
  return (
    res.headers
      .getSetCookie()
      .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
      ?.split(';')[0] ?? ''
  )
}

async function login(email: string, password: string): Promise<Response> {
  return app.request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': IP },
    body: JSON.stringify({ email, password }),
  })
}

async function signInAs(email: string, password: string, profile: ProfileInput): Promise<void> {
  const res = await app.request('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': IP },
    body: JSON.stringify({ email, password }),
  })
  const body = (await res.json()) as { user: { id: string } }
  userId = body.user.id
  cookie = cookieOf(res)
  expect((await send('PUT', '/api/v1/profile', profile)).status).toBe(200)
}

const tess = SEED_USERS.find((u) => u.email === 'tess@example.com')!

beforeEach(async () => {
  resetRateLimits()
  await db.execute(
    sql`truncate table weekly_reviews, log_entries, daily_summaries, foods, ai_calls, weight_entries, target_versions, profiles, sessions, users cascade`,
  )
  await signInAs(tess.email, tess.password, tess.profile)
})

describe('POST /api/v1/account/password', () => {
  it('rejects the wrong current password inline and a weak new one', async () => {
    const wrong = await send('POST', '/api/v1/account/password', {
      currentPassword: 'nope-nope-nope',
      newPassword: 'a-new-password',
    })
    expect(wrong.status).toBe(400)
    expect(apiErrorSchema.parse(await wrong.json()).error.details).toMatchObject({
      fieldErrors: { currentPassword: ['That password is incorrect'] },
    })
    const weak = await send('POST', '/api/v1/account/password', {
      currentPassword: tess.password,
      newPassword: 'short',
    })
    expect(weak.status).toBe(400)
    const same = await send('POST', '/api/v1/account/password', {
      currentPassword: tess.password,
      newPassword: tess.password,
    })
    expect(same.status).toBe(400)
  })

  it('changes the password, keeps this session and signs out every other device', async () => {
    const other = cookieOf(await login(tess.email, tess.password))
    expect((await send('GET', '/api/v1/me', undefined, other)).status).toBe(200)

    const res = await send('POST', '/api/v1/account/password', {
      currentPassword: tess.password,
      newPassword: 'a-new-password',
    })
    expect(res.status).toBe(204)

    expect((await send('GET', '/api/v1/me')).status).toBe(200)
    expect((await send('GET', '/api/v1/me', undefined, other)).status).toBe(401)
    expect((await login(tess.email, tess.password)).status).toBe(401)
    expect((await login(tess.email, 'a-new-password')).status).toBe(200)
  })

  it('rate limits repeated wrong passwords', async () => {
    for (let i = 0; i < 10; i++) {
      await send('POST', '/api/v1/account/password', {
        currentPassword: `wrong-${i}`,
        newPassword: 'a-new-password',
      })
    }
    const limited = await send('POST', '/api/v1/account/password', {
      currentPassword: tess.password,
      newPassword: 'a-new-password',
    })
    expect(limited.status).toBe(429)
  })
})

describe('GET /api/v1/account/export', () => {
  it('returns every log entry, weigh-in, food and target version as JSON', async () => {
    const logged = await seedWeek(userId, tess.email, TZ)
    await seedWeights(userId, tess.email, TZ)
    const res = await send('GET', '/api/v1/account/export/json')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toMatch(
      new RegExp(`attachment; filename="diet-tracker-${localDay(new Date(), TZ)}\\.json"`),
    )
    const data = accountExportSchema.parse(await res.json())
    expect(data.user.email).toBe(tess.email)
    expect(data.profile?.goal).toBe('lose')
    expect(data.targetVersions).toHaveLength(1)
    expect(data.logEntries).toHaveLength(logged)
    expect(data.logEntries.every((e) => e.nutrients.energy_kcal >= 0)).toBe(true)
    expect(data.weightEntries.length).toBeGreaterThanOrEqual(8)
    expect(data.dailySummaries.length).toBeGreaterThan(0)
    expect(data.aiUsage.calls).toBe(0)
    const rows = await db.select().from(logEntries)
    expect(data.logEntries.map((e) => e.id).sort()).toEqual(rows.map((r) => r.id).sort())
  })

  it('writes the food log and the weigh-ins as CSV with one row per entry', async () => {
    const logged = await seedWeek(userId, tess.email, TZ)
    const log = await send('GET', '/api/v1/account/export/log.csv')
    expect(log.status).toBe(200)
    expect(log.headers.get('content-type')).toMatch(/text\/csv/)
    const lines = (await log.text()).trim().split('\r\n')
    expect(lines).toHaveLength(logged + 1)
    expect(lines[0]).toMatch(
      /^day,logged_at,meal,name,quantity,unit,grams,source,confidence,energy_kcal,/,
    )
    expect(lines[0]).toMatch(/,nuts_seeds,assumptions$/)

    const weight = await send('GET', '/api/v1/account/export/weight.csv')
    const weightLines = (await weight.text()).trim().split('\r\n')
    expect(weightLines[0]).toBe('day,weight_kg,note')
    expect(weightLines).toHaveLength(2)

    expect((await send('GET', '/api/v1/account/export/xml')).status).toBe(404)
  })
})

describe('DELETE /api/v1/account', () => {
  it('needs the right password', async () => {
    const res = await send('DELETE', '/api/v1/account', { password: 'not-it' })
    expect(res.status).toBe(400)
    expect(apiErrorSchema.parse(await res.json()).error.details).toMatchObject({
      fieldErrors: { password: ['That password is incorrect'] },
    })
    expect(await db.select().from(users)).toHaveLength(1)
  })

  it('removes every row for the person and clears the cookie', async () => {
    await seedWeek(userId, tess.email, TZ)
    await seedWeights(userId, tess.email, TZ)
    expect((await send('POST', '/api/v1/foods', SEED_FOODS[tess.email]![0])).status).toBe(201)
    const before = await Promise.all([
      db.select().from(logEntries),
      db.select().from(foods),
      db.select().from(weightEntries),
    ])
    expect(before.every((rows) => rows.length > 0)).toBe(true)

    const res = await send('DELETE', '/api/v1/account', { password: tess.password })
    expect(res.status).toBe(204)
    expect(res.headers.getSetCookie().join(';')).toMatch(/dt_session=;/)

    const after = await Promise.all([
      db.select().from(users),
      db.select().from(sessions),
      db.select().from(profiles),
      db.select().from(targetVersions),
      db.select().from(weightEntries),
      db.select().from(foods),
      db.select().from(logEntries),
      db.select().from(dailySummaries),
    ])
    expect(after.map((rows) => rows.length)).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    expect((await send('GET', '/api/v1/me')).status).toBe(401)
    expect((await login(tess.email, tess.password)).status).toBe(401)
  })
})
