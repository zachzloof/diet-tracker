import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { errors } from '../errors.js'
import type { AppEnv } from '../types.js'
import {
  clearSessionCookie,
  readSessionToken,
  resolveSession,
  setSessionCookie,
  type AuthContext,
} from './session-service.js'

/** Resolves the session cookie into `c.get('auth')` for every `/api/*` request. */
export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  c.set('auth', null)
  const token = await readSessionToken(c)
  if (token) {
    const resolved = await resolveSession(token)
    if (resolved) {
      c.set('auth', { user: resolved.user, session: resolved.session })
      if (resolved.renewedExpiresAt) await setSessionCookie(c, token, resolved.renewedExpiresAt)
    } else {
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
