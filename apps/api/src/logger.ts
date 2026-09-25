import { pino, type Logger } from 'pino'
import { env } from './env.js'

export type { Logger }

/** JSON lines in production and tests; pretty-printed in development. */
export const logger: Logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization', '*.password', '*.passwordHash'],
    remove: true,
  },
  ...(env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : {}),
})
