import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

/**
 * Loads `apps/api/.env` into `process.env` without overriding variables that are
 * already set, so the shell and CI always win over the file. No dependency needed:
 * Node 24 ships `util.parseEnv`.
 */
export function loadDotEnv(
  file: string = fileURLToPath(new URL('../.env', import.meta.url)),
): void {
  if (!existsSync(file)) return
  const parsed = parseEnv(readFileSync(file, 'utf8'))
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value
  }
}
