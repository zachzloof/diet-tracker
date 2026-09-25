import { authResponseSchema, apiErrorSchema } from '@diet-tracker/shared'
import { eq, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { db } from '../db/client.js'
import { sessions, users } from '../db/schema/index.js'
import { resetRateLimits } from '../middleware/rate-limit.js'
import { hashPassword } from './password.js'
import { SESSION_COOKIE, hashToken } from './session-service.js'

const app = createApp()
const IP = '203.0.113.7'

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': IP,
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

function get(path: string, headers: Record<string, string> = {}) {
  return app.request(path, { headers: { 'x-forwarded-for': IP, ...headers } })
}

/** The `name=value` pair of the session cookie from a response, or null. */
function sessionCookie(res: Response): string | null {
  const header = res.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`))
  return header?.split(';')[0] ?? null
}

async function errorBody(res: Response) {
  return apiErrorSchema.parse(await res.json()).error
}

const finn = { email: 'finn@example.com', password: 'finn-password' }

beforeEach(async () => {
  resetRateLimits()
  await db.execute(sql`truncate table sessions, users cascade`)
})

describe('POST /api/v1/auth/register', () => {
  it('creates the account, signs in and sets a hardened session cookie', async () => {
    const res = await post('/api/v1/auth/register', { ...finn, email: ' Finn@Example.com ' })
    expect(res.status).toBe(201)
    const { user } = authResponseSchema.parse(await res.json())
    expect(user.email).toBe('finn@example.com')

    const raw = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    expect(raw).toBeDefined()
    expect(raw).toMatch(/HttpOnly/i)
    expect(raw).toMatch(/SameSite=Lax/i)
    expect(raw).toMatch(/Path=\//)
    expect(raw).toMatch(/Max-Age=\d+/)
    // APP_ORIGIN is http://localhost in tests, so no Secure flag; production is https.
    expect(raw).not.toMatch(/;\s*Secure/i)

    const stored = await db.select().from(users).where(eq(users.email, user.email))
    expect(stored[0]?.passwordHash).toMatch(/^\$argon2id\$/)
  })

  it('rejects a duplicate email with 409 email_taken', async () => {
    await post('/api/v1/auth/register', finn)
    const res = await post('/api/v1/auth/register', { ...finn, email: 'FINN@example.com' })
    expect(res.status).toBe(409)
    expect((await errorBody(res)).code).toBe('email_taken')
  })

  it('returns field errors for a bad email and short password', async () => {
    const res = await post('/api/v1/auth/register', { email: 'nope', password: 'short' })
    expect(res.status).toBe(400)
    const error = await errorBody(res)
    expect(error.code).toBe('validation_error')
    expect(error.details).toMatchObject({
      fieldErrors: {
        email: ['Enter a valid email address'],
        password: ['Use at least 8 characters'],
      },
    })
  })

  it('rejects malformed JSON and a non-JSON content type in the same format', async () => {
    const malformed = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    })
    expect(malformed.status).toBe(400)
    expect((await errorBody(malformed)).code).toBe('validation_error')

    const form = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'email=x',
    })
    expect(form.status).toBe(400)
    expect((await errorBody(form)).code).toBe('validation_error')
  })
})

describe('POST /api/v1/auth/login', () => {
  beforeEach(async () => {
    await post('/api/v1/auth/register', finn)
  })

  it('signs in with the right password and the session works on GET /me', async () => {
    const res = await post('/api/v1/auth/login', finn)
    expect(res.status).toBe(200)
    const cookie = sessionCookie(res)
    expect(cookie).not.toBeNull()

    const me = await get('/api/v1/me', { cookie: cookie ?? '' })
    expect(me.status).toBe(200)
    expect(authResponseSchema.parse(await me.json()).user.email).toBe(finn.email)
  })

  it('gives one clear error for a wrong password and for an unknown email', async () => {
    const wrong = await post('/api/v1/auth/login', { ...finn, password: 'wrong-password' })
    expect(wrong.status).toBe(401)
    const wrongError = await errorBody(wrong)
    expect(wrongError.code).toBe('invalid_credentials')
    expect(wrongError.message).toBe('Email or password is incorrect')
    expect(sessionCookie(wrong)).toBeNull()

    const unknown = await post('/api/v1/auth/login', { email: 'nobody@example.com', password: 'x' })
    expect(unknown.status).toBe(401)
    expect((await errorBody(unknown)).message).toBe('Email or password is incorrect')
  })

  it('rate limits the eleventh failed attempt on one email and clears on success', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await post('/api/v1/auth/login', { ...finn, password: `wrong-${i}` })
      expect(res.status).toBe(401)
    }
    const limited = await post('/api/v1/auth/login', finn)
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toMatch(/^\d+$/)
    const error = await errorBody(limited)
    expect(error.code).toBe('rate_limited')
    expect(error.message).toMatch(/^Too many attempts\. Try again in \d+ minutes?\.$/)

    // Another account from the same address is still allowed (per-IP cap is higher).
    await post('/api/v1/auth/register', { email: 'tess@example.com', password: 'tess-password' })
    const other = await post('/api/v1/auth/login', {
      email: 'tess@example.com',
      password: 'tess-password',
    })
    expect(other.status).toBe(200)
  })
})

describe('sessions', () => {
  let cookie = ''

  beforeEach(async () => {
    const res = await post('/api/v1/auth/register', finn)
    cookie = sessionCookie(res) ?? ''
  })

  it('GET /me without a cookie, with a tampered cookie, or after logout is 401', async () => {
    const none = await get('/api/v1/me')
    expect(none.status).toBe(401)
    expect((await errorBody(none)).code).toBe('unauthenticated')

    const tampered = await get('/api/v1/me', { cookie: `${SESSION_COOKIE}=forged.value` })
    expect(tampered.status).toBe(401)

    const logout = await post('/api/v1/auth/logout', {}, { cookie })
    expect(logout.status).toBe(204)
    const cleared = logout.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    expect(cleared).toMatch(/Max-Age=0/i)

    const after = await get('/api/v1/me', { cookie })
    expect(after.status).toBe(401)
    expect(await db.select().from(sessions)).toHaveLength(0)
  })

  it('renews a session that was last seen over an hour ago', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    const soon = new Date(Date.now() + 60 * 60 * 1000)
    await db.update(sessions).set({ lastSeenAt: twoHoursAgo, expiresAt: soon })

    const me = await get('/api/v1/me', { cookie })
    expect(me.status).toBe(200)
    expect(sessionCookie(me)).not.toBeNull()

    const [row] = await db.select().from(sessions)
    expect(row?.expiresAt.getTime()).toBeGreaterThan(soon.getTime())
    expect(row?.lastSeenAt.getTime()).toBeGreaterThan(twoHoursAgo.getTime())

    // A fresh session is not touched again.
    const again = await get('/api/v1/me', { cookie })
    expect(again.status).toBe(200)
    expect(sessionCookie(again)).toBeNull()
  })

  it('ignores an expired session and clears the cookie', async () => {
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) })
    const me = await get('/api/v1/me', { cookie })
    expect(me.status).toBe(401)
    const cleared = me.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    expect(cleared).toMatch(/Max-Age=0/i)
  })

  it('stores only the sha256 of the token', async () => {
    const token = cookie.slice(`${SESSION_COOKIE}=`.length).split('.')[0] ?? ''
    const [row] = await db.select().from(sessions)
    expect(row?.id).toBe(hashToken(token))
    expect(row?.id).not.toContain(token)
  })
})

describe('password hashing', () => {
  it('produces argon2id hashes with the configured cost', async () => {
    const hashed = await hashPassword('correct horse battery staple')
    expect(hashed).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
  })
})
