import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { errors } from '../errors.js'
import type { AppEnv } from '../types.js'
import {
  clearSessionCookie,
  readSession,
  resolveSession,
  setSessionCookie,
  type AuthContext,
} from './session-service.js'

/**
 * Resolves the session cookie or bearer token into `c.get('auth')` for every `/api/*`
 * request. Cookies are only written back to clients that came in with one.
 */
export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  c.set('auth', null)
  const found = await readSession(c)
  if (found) {
    const viaCookie = found.transport === 'cookie'
    const resolved = await resolveSession(found.token)
    if (resolved) {
      c.set('auth', { user: resolved.user, session: resolved.session })
      if (resolved.renewedExpiresAt && viaCookie) {
        await setSessionCookie(c, found.token, resolved.renewedExpiresAt)
      }
    } else if (viaCookie) {
      clearSessionCookie(c)
    }
  }
  await next()
})

export function requireAuth(c: Context<AppEnv>): AuthContext {
  const auth = c.get('auth')
  if (!auth) throw errors.unauthenticated()
  return auth
}
