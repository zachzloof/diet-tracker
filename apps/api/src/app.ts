import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { authRoutes } from './auth/routes.js'
import { sessionMiddleware } from './auth/session-middleware.js'
import { errors, handleError } from './errors.js'
import { requestLog } from './middleware/request-log.js'
import { healthRoutes } from './routes/health.js'
import { meRoutes } from './routes/me.js'
import { registerStatic } from './static.js'
import type { AppEnv } from './types.js'

/** Requests bodies are small JSON; anything bigger is a mistake or abuse. */
const MAX_BODY_BYTES = 64 * 1024

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>()

  app.onError(handleError)
  app.use(requestId())
  app.use(requestLog)
  app.use(secureHeaders())

  app.use(
    '/api/*',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => {
        const error = errors.payloadTooLarge()
        return c.json(error.toBody(), error.status)
      },
    }),
  )
  app.use('/api/*', sessionMiddleware)

  app.route('/api/health', healthRoutes)
  app.route('/api/v1/auth', authRoutes)
  app.route('/api/v1/me', meRoutes)

  // Unknown API paths get the JSON error format, never the SPA fallback.
  app.all('/api/*', () => {
    throw errors.notFound()
  })

  registerStatic(app)
  app.notFound((c) => c.text('Not found', 404))

  return app
}
