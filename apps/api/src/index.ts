import { serve } from '@hono/node-server'
import { purgeExpiredData } from './account/retention.js'
import { createApp } from './app.js'
import { deleteExpiredSessions } from './auth/session-service.js'
import { closeDb } from './db/client.js'
import { env } from './env.js'
import { logger } from './logger.js'
import { sweepRateLimits } from './middleware/rate-limit.js'

const app = createApp()

const server = serve({ fetch: app.fetch, port: env.PORT, hostname: '0.0.0.0' }, (info) => {
  logger.info({ port: info.port, env: env.NODE_ENV }, 'listening')
})

/** History past the retention period is deleted for everyone (privacy policy, "How long we keep it"). */
function purge(): void {
  purgeExpiredData()
    .then((result) => logger.info(result, 'retention purge'))
    .catch((error: unknown) => logger.warn({ err: error }, 'retention purge failed'))
}

const HOUR_MS = 60 * 60 * 1000
let hours = 0
const housekeeping = setInterval(() => {
  sweepRateLimits()
  deleteExpiredSessions().catch((error: unknown) => {
    logger.warn({ err: error }, 'expired session cleanup failed')
  })
  hours += 1
  if (hours % 24 === 0) purge()
}, HOUR_MS)
purge()
housekeeping.unref()

let shuttingDown = false
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  logger.info({ signal }, 'shutting down')
  clearInterval(housekeeping)
  server.close()
  await closeDb().catch(() => undefined)
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
