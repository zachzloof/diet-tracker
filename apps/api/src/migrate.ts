import { closeDb } from './db/client.js'
import { runMigrations } from './db/migrations.js'
import { logger } from './logger.js'

/** CLI entry: `pnpm db:migrate` locally, `node dist/migrate.js` before the server on Railway. */
try {
  const result = await runMigrations()
  logger.info(result, 'migrations applied')
  await closeDb()
} catch (error) {
  logger.error({ err: error }, 'migration failed')
  await closeDb().catch(() => undefined)
  process.exit(1)
}
