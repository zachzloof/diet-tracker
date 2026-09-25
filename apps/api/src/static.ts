import { serveStatic } from '@hono/node-server/serve-static'
import type { Hono } from 'hono'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from './env.js'
import { logger } from './logger.js'
import type { AppEnv } from './types.js'

/** `apps/web/dist` in the monorepo, or wherever WEB_DIST_DIR points (the Docker image). */
function resolveWebDist(): string | null {
  const dir = env.WEB_DIST_DIR ?? fileURLToPath(new URL('../../web/dist', import.meta.url))
  return existsSync(join(dir, 'index.html')) ? dir : null
}

/** Vite hashes everything under /assets; everything else must revalidate (index.html, sw.js, manifest). */
const IMMUTABLE = 'public, max-age=31536000, immutable'
const REVALIDATE = 'no-cache'

/**
 * Serves the built SPA for any GET that is not an API route, with index.html as the
 * fallback so deep links and refreshes work. Registered after the API routes.
 */
export function registerStatic(app: Hono<AppEnv>): void {
  const dist = resolveWebDist()
  if (!dist) {
    logger.warn('web build not found; serving the API only (use the Vite dev server on :5173)')
    app.get('*', (c) =>
      c.text('diet-tracker API is running. In development, open http://localhost:5173', 200),
    )
    return
  }

  const indexHtml = readFileSync(join(dist, 'index.html'), 'utf8')
  app.get(
    '*',
    serveStatic({
      root: dist,
      onFound: (path, c) => {
        c.header('Cache-Control', /[\\/]assets[\\/]/.test(path) ? IMMUTABLE : REVALIDATE)
      },
    }),
  )
  app.get('*', (c) => {
    c.header('Cache-Control', REVALIDATE)
    return c.html(indexHtml)
  })
}
