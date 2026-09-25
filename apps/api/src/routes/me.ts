import type { AuthResponse } from '@diet-tracker/shared'
import { Hono } from 'hono'
import { requireAuth } from '../auth/session-middleware.js'
import { toPublicUser } from '../auth/session-service.js'
import type { AppEnv } from '../types.js'

export const meRoutes = new Hono<AppEnv>().get('/', (c) => {
  const { user } = requireAuth(c)
  const body: AuthResponse = { user: toPublicUser(user) }
  return c.json(body, 200)
})
