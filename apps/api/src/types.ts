import type { RequestIdVariables } from 'hono/request-id'
import type { AuthContext } from './auth/session-service.js'
import type { Logger } from './logger.js'

/** Context variables every handler can rely on. */
export type AppEnv = {
  Variables: RequestIdVariables & {
    log: Logger
    /** Set by the session middleware on `/api/*`: the signed-in user, or null. */
    auth: AuthContext | null
  }
}
