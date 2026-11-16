import { fileURLToPath } from 'node:url'

/**
 * Everything the demo pipeline agrees on: where things live, which ports the demo stack
 * listens on (its own, so a dev server on 3000/5173 is never disturbed), the demo database,
 * the demo account and the pinned clock.
 */

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

export const PATHS = {
  repo: here('..'),
  demo: here('.'),
  api: here('../apps/api'),
  web: here('../apps/web'),
  /** Preload that shifts `Date` in the API and seed processes (see clock.mjs). */
  clock: here('./clock.mjs'),
  /** Recorded OpenAI answers, committed, replayed on every normal run. */
  fixtures: here('./fixtures/openai'),
  /** Scratch: the web build, raw Playwright video, title card frames. Git-ignored. */
  cache: here('./.cache'),
  webDist: here('./.cache/web'),
  raw: here('./.cache/raw'),
  frames: here('./.cache/frames'),
  /** The finished videos. Git-ignored. */
  output: here('./output'),
  logo: here('../docs/brand/minori-logo.png'),
} as const

/** Out-of-the-way ports; override with DEMO_APP_PORT / DEMO_OPENAI_PORT if something else has them. */
export const PORTS = {
  app: Number(process.env.DEMO_APP_PORT ?? 4710),
  openai: Number(process.env.DEMO_OPENAI_PORT ?? 4711),
} as const

export const APP_ORIGIN = `http://127.0.0.1:${PORTS.app}`
export const OPENAI_PROXY_ORIGIN = `http://127.0.0.1:${PORTS.openai}`

/**
 * The demo has its own database in the docker compose Postgres, dropped and rebuilt on
 * every run, so every take starts from the same state and the dev database is never touched.
 */
const PG = process.env.DEMO_PG_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5433'
export const DB = {
  name: 'minori_demo',
  adminUrl: `${PG}/postgres`,
  url: `${PG}/minori_demo`,
} as const

/**
 * The instant the demo believes it is (the API, the seed and the browser all run on this
 * clock). Pinned so the seed, the screens and the recorded AI answers always agree with each
 * other: a Thursday evening, dinner still to log, this week's fourth day in the gym.
 * Change it with DEMO_NOW, then re-record the AI answers with `--live`.
 */
export const DEMO_NOW = new Date(process.env.DEMO_NOW ?? '2026-11-12T18:42:00Z')

export const PERSONA = {
  email: 'jamie.reid@minori.demo',
  password: 'harvest-walkthrough-26',
  timezone: 'Europe/London',
} as const

export const APP = {
  name: 'Minori',
  pitch: 'Type what you ate. Log every set. See where you stand.',
  tagline: 'Nutrition and gym tracker',
} as const

/** The phone the video is recorded on, in CSS pixels, and how many video pixels per CSS pixel. */
export const VIEWPORT = { width: 390, height: 844 } as const
export const VIDEO_SCALE = 2
export const VIDEO_SIZE = {
  width: VIEWPORT.width * VIDEO_SCALE,
  height: VIEWPORT.height * VIDEO_SCALE,
} as const
