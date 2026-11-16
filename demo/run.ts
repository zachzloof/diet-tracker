import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { APP_ORIGIN, DEMO_NOW, PATHS, PERSONA } from './config.js'
import {
  buildWeb,
  ensurePostgres,
  log,
  resetDatabase,
  seedDatabase,
  startApi,
  type RunningApi,
} from './lib/stack.js'
import { startAiProxy, type AiMode } from './openai-replay.js'
import type { Take } from './record.js'

/**
 * `pnpm demo:record`: one command from nothing to finished videos.
 *
 *   1. Postgres up (docker compose), demo database dropped, migrated and seeded
 *   2. web app built (cached), API started on the demo clock, OpenAI record/replay proxy up
 *   3. the walkthrough recorded with Playwright (record.ts)
 *   4. ffmpeg: trim, title card, H.264 master and the short loop (post.ts)
 *
 * Flags:
 *   --live        call OpenAI for real and re-record the AI answers (default: replay them)
 *   --serve       stop after step 2 and keep the app running, to look around by hand
 *   --skip-post   record only; leave the raw take in demo/.cache/raw
 *   --rebuild     rebuild the web app even if the cached build looks current
 *   --post-only   skip everything but step 4, on the take already in demo/.cache/raw
 *   --run <file>  instead of recording, run that module's default export against the stack
 *                 and stop (for trying out a step or taking screenshots)
 */
const { values: flags } = parseArgs({
  options: {
    live: { type: 'boolean', default: false },
    serve: { type: 'boolean', default: false },
    'skip-post': { type: 'boolean', default: false },
    rebuild: { type: 'boolean', default: false },
    'post-only': { type: 'boolean', default: false },
    run: { type: 'string' },
  },
})

const ai: AiMode = flags.live ? 'live' : 'replay'

/** The last take's timings, kept so the ffmpeg step can be redone without re-recording. */
const TAKE_FILE = join(PATHS.cache, 'take.json')

async function finish(take: Take, startedAt: number): Promise<void> {
  const { postProcess } = await import('./post.js')
  const outputs = await postProcess(take)
  log(`done in ${Math.round((Date.now() - startedAt) / 1000)} s`)
  for (const output of outputs) log(output)
}

async function main(): Promise<void> {
  const startedAt = Date.now()
  await mkdir(PATHS.cache, { recursive: true })
  if (flags['post-only']) {
    await finish(JSON.parse(await readFile(TAKE_FILE, 'utf8')) as Take, startedAt)
    return
  }
  log(`demo clock: ${DEMO_NOW.toISOString()}; AI answers: ${ai}`)

  await ensurePostgres()
  await resetDatabase(ai)
  await seedDatabase(ai)
  await buildWeb(flags.rebuild)

  const proxy = await startAiProxy(ai)
  let api: RunningApi | null = null

  try {
    api = await startApi(ai)
    if (flags.serve) {
      log(`serving on ${APP_ORIGIN} as ${PERSONA.email} / ${PERSONA.password}; Ctrl+C to stop`)
      await new Promise<void>((done) => process.once('SIGINT', () => done()))
      return
    }

    if (flags.run) {
      const script = (await import(pathToFileURL(resolve(flags.run)).href)) as {
        default: () => Promise<void>
      }
      await script.default()
      log(`AI calls answered: ${proxy.calls().join(', ') || 'none'}`)
      return
    }

    const { record } = await import('./record.js')
    const take = await record()
    await writeFile(TAKE_FILE, JSON.stringify(take, null, 2), 'utf8')
    log(`AI calls answered: ${proxy.calls().join(', ') || 'none'}`)
    if (proxy.misses().length > 0) {
      throw new Error(
        `The take is no good: no recorded AI answer for ${proxy.misses().join(', ')}. ` +
          'Run `pnpm demo:record --live` once to record them.',
      )
    }
    if (flags['skip-post']) {
      log(`raw take: ${take.video}`)
      return
    }
    await finish(take, startedAt)
  } finally {
    await api?.stop()
    await proxy.close()
  }
}

main().catch((error: unknown) => {
  console.error(`[demo] failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
