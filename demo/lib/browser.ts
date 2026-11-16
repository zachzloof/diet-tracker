import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { APP_ORIGIN, PATHS, PERSONA, VIDEO_SIZE, VIEWPORT } from '../config.js'
import { CURSOR_INIT_SCRIPT } from './cursor.js'
import { CLOCK_OFFSET_MS } from './stack.js'

/**
 * The phone the walkthrough is recorded on: a 390x844 touch viewport on the demo clock,
 * signed in as the demo account, dark theme, with the finger-dot cursor injected.
 */

export interface Phone {
  browser: Browser
  context: BrowserContext
  page: Page
}

/** The same shift as clock.mjs, for the page: `Date` reads the demo clock and keeps ticking. */
function clockInitScript(offsetMs: number): string {
  return `(() => {
    const offset = ${offsetMs};
    const RealDate = Date;
    class DemoDate extends RealDate {
      constructor(...args) {
        if (args.length === 0) super(RealDate.now() + offset);
        else super(...args);
      }
      static now() { return RealDate.now() + offset; }
      static [Symbol.hasInstance](value) { return value instanceof RealDate; }
    }
    window.Date = DemoDate;
  })();`
}

/** What a returning user's phone already remembers, so no first-run cards get in the shot. */
function deviceStateInitScript(userId: string): string {
  const state: Record<string, string> = {
    'dt.theme': 'dark',
    'dt.mode': 'diet',
    'dt.ai-consent': userId,
    'dt.install-hint-dismissed': '1',
  }
  return `(() => {
    if (sessionStorage.getItem('demo.primed')) return;
    sessionStorage.setItem('demo.primed', '1');
    for (const [key, value] of Object.entries(${JSON.stringify(state)})) localStorage.setItem(key, value);
  })();`
}

export interface OpenOptions {
  /** Record the page to demo/.cache/raw. */
  video?: boolean
  headless?: boolean
}

export async function openPhone(options: OpenOptions = {}): Promise<Phone> {
  const browser = await chromium.launch({ headless: options.headless ?? true })
  const context = await browser.newContext({
    baseURL: APP_ORIGIN,
    // The window is the size of the video (two video pixels per CSS pixel); the viewport meta
    // tag rewritten below lays the page out 390 wide inside it, the way a 2x phone screen does.
    // Playwright's recorder films CSS pixels, so a plain deviceScaleFactor of 2 would not help.
    viewport: VIDEO_SIZE,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    locale: 'en-GB',
    timezoneId: PERSONA.timezone,
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
    // The service worker would cache an old app shell between takes.
    serviceWorkers: 'block',
    ...(options.video ? { recordVideo: { dir: PATHS.raw, size: VIDEO_SIZE } } : {}),
  })

  // Sign in through the API (the cookie lands in this context) before any page exists, so
  // the recording never shows a login screen.
  const response = await context.request.post('/api/v1/auth/login', {
    data: { email: PERSONA.email, password: PERSONA.password },
  })
  if (!response.ok()) {
    throw new Error(`demo sign-in failed: ${response.status()} ${await response.text()}`)
  }
  const { user } = (await response.json()) as { user: { id: string } }

  await context.addInitScript(clockInitScript(CLOCK_OFFSET_MS))
  await context.addInitScript(deviceStateInitScript(user.id))
  await context.addInitScript(CURSOR_INIT_SCRIPT)

  await context.route(
    (url) =>
      url.origin === APP_ORIGIN &&
      !url.pathname.startsWith('/api/') &&
      !/\.\w+$/.test(url.pathname),
    async (route) => {
      if (route.request().resourceType() !== 'document') return route.fallback()
      const response = await route.fetch()
      const html = (await response.text()).replace(
        /<meta name="viewport"[^>]*>/,
        `<meta name="viewport" content="width=${VIEWPORT.width}, viewport-fit=cover" />`,
      )
      await route.fulfill({ response, body: html })
    },
  )

  const page = await context.newPage()
  return { browser, context, page }
}
