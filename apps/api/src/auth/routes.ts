import { loginInputSchema, registerInputSchema, type AuthResponse } from '@diet-tracker/shared'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { v7 as uuidv7 } from 'uuid'
import { db } from '../db/client.js'
import { users } from '../db/schema/index.js'
import { errors } from '../errors.js'
import {
  clientIp,
  loginEmailLimiter,
  loginIpLimiter,
  registerIpLimiter,
} from '../middleware/rate-limit.js'
import { jsonBody, requireJson } from '../middleware/validate.js'
import type { AppEnv } from '../types.js'
import { hashPassword, verifyPassword } from './password.js'
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  readSessionToken,
  setSessionCookie,
  toPublicUser,
} from './session-service.js'

/** Verified against when the email is unknown, so timing does not reveal which emails exist. */
const dummyHash = await hashPassword('not-a-real-password-just-for-constant-time')

export const authRoutes = new Hono<AppEnv>()
  .post('/register', requireJson, jsonBody(registerInputSchema), async (c) => {
    const ip = clientIp(c)
    const retryAfter = registerIpLimiter.retryAfter(ip)
    if (retryAfter > 0) throw errors.rateLimited(retryAfter)
    registerIpLimiter.hit(ip)

    const { email, password } = c.req.valid('json')
    const passwordHash = await hashPassword(password)
    const inserted = await db
      .insert(users)
      .values({ id: uuidv7(), email, passwordHash })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id, email: users.email, createdAt: users.createdAt })
    const user = inserted[0]
    if (!user) throw errors.emailTaken()

    const { token, expiresAt } = await createSession(user.id, c.req.header('user-agent') ?? null)
    await setSessionCookie(c, token, expiresAt)
    const body: AuthResponse = { user: toPublicUser(user) }
    return c.json(body, 201)
  })

  .post('/login', requireJson, jsonBody(loginInputSchema), async (c) => {
    const { email, password } = c.req.valid('json')
    const emailKey = `email:${email}`
    const ipKey = `ip:${clientIp(c)}`
    const retryAfter = Math.max(
      loginEmailLimiter.retryAfter(emailKey),
      loginIpLimiter.retryAfter(ipKey),
    )
    if (retryAfter > 0) throw errors.rateLimited(retryAfter)

    const found = await db.select().from(users).where(eq(users.email, email)).limit(1)
    const user = found[0]
    const ok = user
      ? await verifyPassword(user.passwordHash, password)
      : await verifyPassword(dummyHash, password)
    if (!user || !ok) {
      loginEmailLimiter.hit(emailKey)
      loginIpLimiter.hit(ipKey)
      throw errors.invalidCredentials()
    }
    loginEmailLimiter.reset(emailKey)

    const { token, expiresAt } = await createSession(user.id, c.req.header('user-agent') ?? null)
    await setSessionCookie(c, token, expiresAt)
    const body: AuthResponse = { user: toPublicUser(user) }
    return c.json(body, 200)
  })

  .post('/logout', async (c) => {
    const token = await readSessionToken(c)
    if (token) await deleteSession(token)
    clearSessionCookie(c)
    return c.body(null, 204)
  })
