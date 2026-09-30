import type { PublicUser } from '@diet-tracker/shared'
import { and, eq, gt, lt } from 'drizzle-orm'
import type { Context } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'
import type { CookieOptions } from 'hono/utils/cookie'
import { createHash, randomBytes } from 'node:crypto'
import { db } from '../db/client.js'
import { sessions, users, type Session, type User } from '../db/schema/index.js'
import { env } from '../env.js'

/**
 * Sessions live in Postgres so they survive redeploys. The browser holds a random token
 * in a signed, HttpOnly cookie; the database holds only its sha256, so a leaked table
 * cannot be replayed. Lookup is by token, and the cookie is just the transport: the
 * native shells send the same token as `Authorization: Bearer` instead (D4, D23).
 */
export const SESSION_COOKIE = 'dt_session'
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** Sliding renewal: extend the session when it was last seen more than an hour ago. */
export const SESSION_RENEW_AFTER_MS = 60 * 60 * 1000

export interface AuthContext {
  user: User
  session: Session
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function toPublicUser(user: Pick<User, 'id' | 'email' | 'createdAt'>): PublicUser {
  return { id: user.id, email: user.email, createdAt: user.createdAt.toISOString() }
}

export async function createSession(
  userId: string,
  userAgent: string | null,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS)
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt,
    lastSeenAt: now,
    createdAt: now,
    userAgent: userAgent?.slice(0, 512) ?? null,
  })
  return { token, expiresAt }
}

export interface ResolvedSession extends AuthContext {
  /** Set when this request renewed the session; the cookie should be re-sent. */
  renewedExpiresAt: Date | null
}

export async function resolveSession(token: string): Promise<ResolvedSession | null> {
  const id = hashToken(token)
  const now = new Date()
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now)))
    .limit(1)
  const row = rows[0]
  if (!row) return null

  let renewedExpiresAt: Date | null = null
  if (now.getTime() - row.session.lastSeenAt.getTime() > SESSION_RENEW_AFTER_MS) {
    renewedExpiresAt = new Date(now.getTime() + SESSION_TTL_MS)
    await db
      .update(sessions)
      .set({ lastSeenAt: now, expiresAt: renewedExpiresAt })
      .where(eq(sessions.id, id))
    row.session = { ...row.session, lastSeenAt: now, expiresAt: renewedExpiresAt }
  }
  return { user: row.user, session: row.session, renewedExpiresAt }
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)))
}

export async function deleteExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()))
}

function baseCookieOptions(): CookieOptions {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: env.APP_ORIGIN.startsWith('https://'),
  }
}

export async function setSessionCookie(c: Context, token: string, expiresAt: Date): Promise<void> {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
  await setSignedCookie(c, SESSION_COOKIE, token, env.SESSION_SECRET, {
    ...baseCookieOptions(),
    expires: expiresAt,
    maxAge,
  })
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, baseCookieOptions())
}

export type SessionTransport = 'cookie' | 'bearer'

/** The raw token from the `Authorization: Bearer` header, or null. */
function readBearerToken(c: Context): string | null {
  const match = /^Bearer\s+([A-Za-z0-9_-]{20,200})$/i.exec(c.req.header('authorization') ?? '')
  return match?.[1] ?? null
}

/** The raw token and how it arrived: a bearer header wins over a validly signed cookie. */
export async function readSession(
  c: Context,
): Promise<{ token: string; transport: SessionTransport } | null> {
  const bearer = readBearerToken(c)
  if (bearer) return { token: bearer, transport: 'bearer' }
  const value = await getSignedCookie(c, env.SESSION_SECRET, SESSION_COOKIE)
  return typeof value === 'string' && value.length > 0
    ? { token: value, transport: 'cookie' }
    : null
}

export async function readSessionToken(c: Context): Promise<string | null> {
  return (await readSession(c))?.token ?? null
}
