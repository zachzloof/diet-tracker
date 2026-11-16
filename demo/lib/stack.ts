import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import pg from 'pg'
import { APP_ORIGIN, DB, DEMO_NOW, OPENAI_PROXY_ORIGIN, PATHS, PORTS } from '../config.js'
import type { AiMode } from '../openai-replay.js'

/**
 * The demo stack: its own database, the web app built once into demo/.cache/web, and one API
 * process serving both on PORTS.app. Everything runs the app's real code; only the
 * environment differs (database, port, clock, where OpenAI is).
 */

export function log(message: string): void {
  console.log(`[demo] ${message}`)
}

interface RunOptions {
  cwd: string
  env?: NodeJS.ProcessEnv
  /** Print the child's output as it comes instead of only when it fails. */
  loud?: boolean
}

/** Runs a command to the end; rejects with its output when it exits non-zero. */
export function run(command: string, args: string[], options: RunOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let output = ''
    const collect = (part: Buffer): void => {
      output += part.toString('utf8')
      if (options.loud) process.stdout.write(part)
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(output)
      else reject(new Error(`${command} ${args.join(' ')} exited ${code}\n${output.slice(-4000)}`))
    })
  })
}

/** Milliseconds to add to the real clock so the demo's "now" is DEMO_NOW. Worked out once per run. */
export const CLOCK_OFFSET_MS = DEMO_NOW.getTime() - Date.now()

const SESSION_SECRET = randomBytes(32).toString('hex')

/** The environment every demo process (migrate, seed, API) runs in. */
export function demoEnv(ai: AiMode): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(PORTS.app),
    LOG_LEVEL: 'warn',
    DATABASE_URL: DB.url,
    SESSION_SECRET,
    APP_ORIGIN,
    WEB_DIST_DIR: PATHS.webDist,
    OPENAI_BASE_URL: `${OPENAI_PROXY_ORIGIN}/v1`,
    // The estimator is asked about a home-made meal; a web search would only add seconds.
    AI_WEB_SEARCH: 'false',
    DEMO_CLOCK_OFFSET_MS: String(CLOCK_OFFSET_MS),
  }
  delete env.OWNER_EMAIL
  if (ai === 'replay') {
    // Replay never reaches OpenAI, so the real key stays out of the process altogether.
    env.OPENAI_API_KEY = 'demo-replay-no-key'
  } else if (process.env.DEMO_OPENAI_API_KEY) {
    env.OPENAI_API_KEY = process.env.DEMO_OPENAI_API_KEY
  } else {
    // Fall through to apps/api/.env: a key exported in the shell may be a stale one.
    delete env.OPENAI_API_KEY
  }
  return env
}

const NODE_TS = ['--conditions=development', '--import', 'tsx']
const WITH_CLOCK = [...NODE_TS, '--import', pathToFileURL(PATHS.clock).href]

async function canConnect(url: string): Promise<boolean> {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 2000 })
  try {
    await client.connect()
    await client.query('select 1')
    return true
  } catch {
    return false
  } finally {
    await client.end().catch(() => undefined)
  }
}

/** Starts the docker compose Postgres if nothing answers on its port yet. */
export async function ensurePostgres(): Promise<void> {
  if (await canConnect(DB.adminUrl)) return
  log('Postgres is not answering; running docker compose up -d db')
  try {
    await run('docker', ['compose', 'up', '-d', 'db'], { cwd: PATHS.repo })
  } catch (error) {
    throw new Error(
      `Could not start Postgres. Is Docker Desktop running?\n${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await canConnect(DB.adminUrl)) return
    await sleep(1000)
  }
  throw new Error('Postgres did not come up within a minute')
}

/** Drops and recreates the demo database, then runs the app's own migrations into it. */
export async function resetDatabase(ai: AiMode): Promise<void> {
  const admin = new pg.Client({ connectionString: DB.adminUrl })
  await admin.connect()
  try {
    await admin.query(`drop database if exists ${DB.name} with (force)`)
    await admin.query(`create database ${DB.name}`)
  } finally {
    await admin.end()
  }
  await run(process.execPath, [...NODE_TS, 'src/migrate.ts'], { cwd: PATHS.api, env: demoEnv(ai) })
}

export async function seedDatabase(ai: AiMode): Promise<void> {
  const output = await run(process.execPath, [...WITH_CLOCK, 'seed.ts'], {
    cwd: PATHS.demo,
    env: demoEnv(ai),
  })
  for (const line of output.split('\n')) {
    if (line.startsWith('[seed]')) log(line.slice(7))
  }
}

async function newestMtime(path: string): Promise<number> {
  const info = await stat(path)
  if (!info.isDirectory()) return info.mtimeMs
  let newest = 0
  for (const name of await readdir(path)) {
    if (name === 'node_modules' || name === 'dist') continue
    newest = Math.max(newest, await newestMtime(join(path, name)))
  }
  return newest
}

/**
 * Builds the web app into demo/.cache/web (not apps/web/dist, which is left alone) unless
 * the build there is already newer than every source file. A production build is recorded
 * rather than the Vite dev server: no cold-compile pauses, no dev overlays.
 */
export async function buildWeb(force = false): Promise<void> {
  const index = join(PATHS.webDist, 'index.html')
  const shared = join(PATHS.repo, 'packages/shared')
  if (!force && existsSync(index)) {
    const built = (await stat(index)).mtimeMs
    const sources = await Promise.all([
      newestMtime(join(PATHS.web, 'src')),
      newestMtime(join(PATHS.web, 'index.html')),
      newestMtime(join(PATHS.web, 'vite.config.ts')),
      newestMtime(join(shared, 'src')),
    ])
    if (Math.max(...sources) < built) {
      log('web build is up to date')
      return
    }
  }
  log('building the web app (about half a minute)')
  await run(
    process.execPath,
    [join(shared, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.build.json'],
    { cwd: shared },
  )
  await run(
    process.execPath,
    [
      join(PATHS.web, 'node_modules/vite/bin/vite.js'),
      'build',
      '--outDir',
      PATHS.webDist,
      '--emptyOutDir',
    ],
    { cwd: PATHS.web },
  )
}

export interface RunningApi {
  stop(): Promise<void>
}

async function healthy(): Promise<boolean> {
  try {
    const response = await fetch(`${APP_ORIGIN}/api/health`, { signal: AbortSignal.timeout(2000) })
    return response.ok
  } catch {
    return false
  }
}

/** Starts the API (which also serves the web build) on the pinned clock and waits for it. */
export async function startApi(ai: AiMode): Promise<RunningApi> {
  if (await healthy()) {
    throw new Error(
      `Something already answers on ${APP_ORIGIN}. A demo run that did not shut down? Stop it and try again.`,
    )
  }
  const child: ChildProcess = spawn(process.execPath, [...WITH_CLOCK, 'src/index.ts'], {
    cwd: PATHS.api,
    env: demoEnv(ai),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let output = ''
  child.stdout?.on('data', (part: Buffer) => (output += part.toString('utf8')))
  child.stderr?.on('data', (part: Buffer) => (output += part.toString('utf8')))
  let exited = false
  child.on('exit', () => (exited = true))

  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (exited) throw new Error(`The API exited while starting:\n${output.slice(-4000)}`)
    if (await healthy()) {
      return {
        stop: () =>
          new Promise<void>((resolve) => {
            if (exited) return resolve()
            child.once('exit', () => resolve())
            child.kill()
          }),
      }
    }
    await sleep(500)
  }
  child.kill()
  throw new Error(
    `The API did not answer on ${APP_ORIGIN} within a minute:\n${output.slice(-4000)}`,
  )
}
