import { createMiddleware } from 'hono/factory'
import { logger } from '../logger.js'
import type { AppEnv } from '../types.js'

/** One log line per request with the request id, method, path, status and duration. */
export const requestLog = createMiddleware<AppEnv>(async (c, next) => {
  const start = performance.now()
  const log = logger.child({ requestId: c.get('requestId') })
  c.set('log', log)
  await next()
  const ms = Math.round(performance.now() - start)
  const fields = { method: c.req.method, path: c.req.path, status: c.res.status, ms }
  if (c.req.path.startsWith('/api/')) log.info(fields, 'request')
  else log.debug(fields, 'request')
})
