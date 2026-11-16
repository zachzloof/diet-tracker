import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { PATHS, PORTS } from './config.js'

/**
 * A small stand-in for api.openai.com that the demo API is pointed at with OPENAI_BASE_URL
 * (the OpenAI SDK reads it; no app code changes).
 *
 * - `live`: forwards every call to OpenAI, streams the answer straight back, and saves it
 *   (body and timing) under fixtures/openai. The Authorization header is passed through
 *   and never written down.
 * - `replay`: answers each call from those files at a steady, watchable pace. Nothing leaves
 *   the machine, nothing is billed, and every take gets word-for-word the same answers.
 *
 * Calls are matched by kind and order ("food_estimate-1", "coach-1", "coach-2", ...), not
 * by content: the seed makes new ids on every run, so request bodies never repeat exactly.
 */

export type AiMode = 'replay' | 'live'

interface Chunk {
  /** Milliseconds after the request arrived. */
  atMs: number
  text: string
}

interface Fixture {
  kind: string
  index: number
  model: string | null
  status: number
  contentType: string
  recordedAt: string
  chunks: Chunk[]
}

/** How replayed answers are paced. Real latency is 3 to 20 s a call; nobody wants to watch that. */
const PACING = {
  /** A whole (non-streamed) answer: long enough to read the "working on it" state. */
  wholeAnswerMs: 1700,
  /** A streamed answer: the wait before its first event, and the longest pause after that. */
  firstEventMs: 450,
  maxGapMs: 110,
} as const

const UPSTREAM = 'https://api.openai.com'

export interface AiProxy {
  /** Every call answered so far, e.g. `food_estimate-1`. */
  calls(): string[]
  /** Calls replay had no recording for. A take with any of these is not a good take. */
  misses(): string[]
  close(): Promise<void>
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = []
    req.on('data', (part: Buffer) => parts.push(part))
    req.on('end', () => resolve(Buffer.concat(parts)))
    req.on('error', reject)
  })
}

/** What the call is for: the Structured Outputs schema name, or the coach for a streamed tool round. */
function describe(body: Buffer): { kind: string; model: string | null } {
  try {
    const parsed: unknown = JSON.parse(body.toString('utf8'))
    if (typeof parsed !== 'object' || parsed === null) return { kind: 'call', model: null }
    const request = parsed as { model?: unknown; stream?: unknown; text?: { format?: unknown } }
    const format = request.text?.format as { name?: unknown } | undefined
    const model = typeof request.model === 'string' ? request.model : null
    if (typeof format?.name === 'string') return { kind: format.name, model }
    return { kind: request.stream === true ? 'coach' : 'call', model }
  } catch {
    return { kind: 'call', model: null }
  }
}

const fixturePath = (kind: string, index: number): string =>
  join(PATHS.fixtures, `${kind}-${index}.json`)

async function replay(res: ServerResponse, kind: string, index: number): Promise<boolean> {
  let fixture: Fixture
  try {
    fixture = JSON.parse(await readFile(fixturePath(kind, index), 'utf8')) as Fixture
  } catch {
    res.writeHead(503, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        error: {
          message: `demo replay has no recording for ${kind}-${index}; run demo:record -- --live`,
          type: 'demo_replay_miss',
        },
      }),
    )
    return false
  }

  const streamed = fixture.contentType.includes('text/event-stream')
  if (!streamed) {
    await sleep(PACING.wholeAnswerMs)
    res.writeHead(fixture.status, { 'content-type': fixture.contentType })
    res.end(fixture.chunks.map((chunk) => chunk.text).join(''))
    return true
  }

  res.writeHead(fixture.status, {
    'content-type': fixture.contentType,
    'cache-control': 'no-cache',
  })
  let previous = 0
  for (const [position, chunk] of fixture.chunks.entries()) {
    const gap = chunk.atMs - previous
    previous = chunk.atMs
    await sleep(position === 0 ? PACING.firstEventMs : Math.min(gap, PACING.maxGapMs))
    res.write(chunk.text)
  }
  res.end()
  return true
}

async function forward(
  req: IncomingMessage,
  res: ServerResponse,
  body: Buffer,
  kind: string,
  index: number,
  model: string | null,
): Promise<void> {
  const startedAt = performance.now()
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value !== 'string') continue
    if (['host', 'connection', 'content-length', 'accept-encoding'].includes(name)) continue
    headers.set(name, value)
  }
  const upstream = await fetch(`${UPSTREAM}${req.url ?? ''}`, {
    method: req.method ?? 'POST',
    headers,
    body: new Uint8Array(body),
  })
  const contentType = upstream.headers.get('content-type') ?? 'application/json'
  res.writeHead(upstream.status, { 'content-type': contentType })

  const chunks: Chunk[] = []
  const decoder = new TextDecoder()
  const reader = upstream.body?.getReader()
  while (reader) {
    const { done, value } = await reader.read()
    if (done) break
    res.write(value)
    const text = decoder.decode(value, { stream: true })
    if (text) chunks.push({ atMs: Math.round(performance.now() - startedAt), text })
  }
  res.end()

  // A failed call is not worth replaying; the take that recorded it has to be redone anyway.
  if (upstream.status >= 400) return
  const fixture: Fixture = {
    kind,
    index,
    model,
    status: upstream.status,
    contentType,
    recordedAt: new Date().toISOString(),
    chunks,
  }
  await writeFile(fixturePath(kind, index), `${JSON.stringify(fixture, null, 1)}\n`, 'utf8')
}

export async function startAiProxy(mode: AiMode): Promise<AiProxy> {
  await mkdir(PATHS.fixtures, { recursive: true })
  if (mode === 'live') {
    for (const file of await readdir(PATHS.fixtures)) {
      if (file.endsWith('.json')) await rm(join(PATHS.fixtures, file))
    }
  }

  const counts = new Map<string, number>()
  const calls: string[] = []
  const misses: string[] = []

  const server = createServer((req, res) => {
    void (async () => {
      const body = await readBody(req)
      const { kind, model } = describe(body)
      const index = (counts.get(kind) ?? 0) + 1
      counts.set(kind, index)
      const label = `${kind}-${index}`
      calls.push(label)
      if (mode === 'live') {
        await forward(req, res, body, kind, index, model)
      } else if (!(await replay(res, kind, index))) {
        misses.push(label)
      }
    })().catch((error: unknown) => {
      misses.push(`error: ${error instanceof Error ? error.message : String(error)}`)
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'demo proxy failed', type: 'demo_proxy' } }))
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(PORTS.openai, '127.0.0.1', resolve)
  })

  return {
    calls: () => [...calls],
    misses: () => [...misses],
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}
