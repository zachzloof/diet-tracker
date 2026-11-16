import { mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { Locator, Page } from 'playwright'
import { PATHS, VIEWPORT } from './config.js'
import { openPhone } from './lib/browser.js'
import { Hand } from './lib/human.js'
import { log } from './lib/stack.js'

/**
 * The walkthrough itself: one continuous take on a phone-sized screen, two journeys.
 *
 *   A day of food   1 Today as it stands at 18:42      2 type dinner, AI estimates it
 *                   3 the day closes: ring, log, micros 4 Week: days met, gaps, AI review
 *   Gym and coach   5 flip Food to Gym                  6 tick the last sets, finish
 *                   7 Week on week                      8 a lift's trend over three months
 *                   9 ask the coach, across both halves
 *
 * Every wait for the app is on something the app shows (a selector, the network going
 * quiet). The pauses are the film's pacing: how long the viewer gets to read a screen.
 */

/** What Jamie types. Quantities are in there because the app says they help, and they do. */
const DINNER = 'Chicken burrito bowl: 200g chicken, rice, black beans, cheese, guac and salsa'
const QUESTION = 'Is my bench press still going up, and am I eating enough for it?'

/** Where the finger waits while the viewer reads, clear of the numbers that matter. */
const REST = {
  /** The gap between an item's name and its kcal on the estimate card. */
  sheet: [VIEWPORT.width * 0.63, VIEWPORT.height * 0.62],
  /** Hard against the right edge, mid-screen, where a right thumb hovers. */
  edge: [VIEWPORT.width - 14, VIEWPORT.height * 0.58],
} as const satisfies Record<string, readonly [number, number]>

export interface Take {
  /** The raw Playwright recording (WebM, VP8). */
  video: string
  /** Wall-clock ms at which the sync flash was painted; post.ts finds the same frame in the video. */
  syncAt: number
  /** Wall-clock ms of the first and last frame worth keeping. */
  startAt: number
  endAt: number
  /** Wall-clock ms of the moments the short loop is cut from. */
  marks: Record<string, number>
}

/** Moves the app to a route without a reload, through its own router (pre-roll only). */
async function jump(page: Page, path: string): Promise<void> {
  await page.evaluate((to) => {
    interface VueRoot extends Element {
      __vue_app__?: {
        config: { globalProperties: { $router: { push(to: string): Promise<unknown> } } }
      }
    }
    const root: VueRoot | null = document.querySelector('#app')
    return root?.__vue_app__?.config.globalProperties.$router.push(to)
  }, path)
  await page.waitForLoadState('networkidle')
}

/**
 * Has the app refetch every cached screen that is not on show, the way it would in the
 * background anyway, so the next screen opens on today's numbers instead of flashing the old
 * ones. Uses the app's own query client (installed by VueQueryPlugin); no app code changes.
 */
async function freshen(page: Page): Promise<void> {
  await page.evaluate(async () => {
    interface QueryClientLike {
      refetchQueries(filters: { type: 'inactive' }): Promise<void>
    }
    interface VueRoot extends Element {
      __vue_app__?: { _context: { provides: Record<string, unknown> } }
    }
    const root: VueRoot | null = document.querySelector('#app')
    const client = root?.__vue_app__?._context.provides.VUE_QUERY_CLIENT as
      QueryClientLike | undefined
    if (!client) throw new Error('demo: the app has no query client to refresh')
    await client.refetchQueries({ type: 'inactive' })
  })
}

/** One magenta frame-and-a-bit, off camera, so post.ts can line the video up with the clock. */
async function syncFlash(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const flash = document.createElement('div')
        flash.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#ff00ff'
        document.documentElement.appendChild(flash)
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            // performance time is the real clock; `Date` in the page is the demo clock.
            const paintedAt = performance.timeOrigin + performance.now()
            setTimeout(() => {
              flash.remove()
              resolve(paintedAt)
            }, 320)
          }),
        )
      }),
  )
}

/** Resolves once the element's text has stopped changing for `quietMs` (a streamed answer). */
async function settled(target: Locator, quietMs: number): Promise<void> {
  const handle = await target.elementHandle()
  if (!handle) throw new Error('demo: nothing to watch for a streamed answer')
  await handle.evaluate(
    (node, quiet) =>
      new Promise<void>((resolve) => {
        let timer = setTimeout(resolve, quiet)
        new MutationObserver(() => {
          clearTimeout(timer)
          timer = setTimeout(resolve, quiet)
        }).observe(node, { childList: true, subtree: true, characterData: true })
      }),
    quietMs,
  )
}

export async function record(): Promise<Take> {
  await rm(PATHS.raw, { recursive: true, force: true })
  await mkdir(PATHS.raw, { recursive: true })

  const { browser, context, page } = await openPhone({ video: true })
  const hand = new Hand(page)
  const marks: Record<string, number> = {}
  const mark = (name: string): void => {
    marks[name] = Date.now()
  }
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  const nav = page.getByRole('navigation', { name: 'Main' })
  const tab = (name: string): Locator => nav.getByRole('link', { name: new RegExp(`^${name}`) })
  const heading = (name: string | RegExp): Locator => page.getByRole('heading', { name })

  try {
    // --- Pre-roll (cut from the film): load, warm every screen the film visits, sync ------
    await page.goto('/')
    await page.getByText('kcal left').waitFor()
    // Visiting each screen once fills the app's caches, so the film has no skeleton flashes.
    // (Food's Week is left cold on purpose: its AI review should be written after dinner.)
    await jump(page, '/gym')
    await page.getByText('In progress').click()
    await page
      .locator('section[aria-label="Triceps pushdown"]')
      .getByText(/Last time/)
      .waitFor()
    await page.waitForLoadState('networkidle')
    await jump(page, '/workouts')
    await jump(page, '/gym/week')
    await jump(page, '/gym/lifts')
    await page.getByRole('link', { name: /Barbell bench press/ }).click()
    await heading('Best set per session').waitFor()
    await page.waitForLoadState('networkidle')
    await jump(page, '/coach')
    // Food's Week too, but not its AI review yet: that is written after dinner is logged, so
    // the pre-roll's request for it gets a polite "not now".
    await page.route('**/api/v1/ai/weekly-review**', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'ai_unavailable', message: 'Not yet' } }),
      }),
    )
    await jump(page, '/week')
    await page.getByText('Days met').waitFor()
    await page.waitForLoadState('networkidle')
    await page.unroute('**/api/v1/ai/weekly-review**')
    await jump(page, '/')
    await page.getByText('kcal left').waitFor()
    await page.evaluate(() => document.fonts.ready)
    await page.waitForLoadState('networkidle')
    const syncAt = await syncFlash(page)
    await hand.pause(900)

    // --- 1. Today, 18:42: dinner still to log ---------------------------------------------
    const startAt = Date.now()
    mark('today')
    await hand.pause(800)
    await hand.appear()
    await hand.pause(1300)

    // --- 2. Type dinner; the AI estimates it ----------------------------------------------
    await hand.tap(nav.getByRole('button', { name: /log/i }))
    const sheet = page.getByRole('dialog')
    const describe = sheet.getByRole('textbox', { name: 'What did you eat?' })
    await describe.waitFor()
    await hand.pause(400)
    await hand.type(describe, DINNER)
    await hand.pause(450)
    mark('estimate')
    await hand.tap(sheet.getByRole('button', { name: 'Estimate' }))
    await hand.glide(...REST.sheet)
    await sheet.getByText('Edit text').waitFor()
    mark('review')
    await hand.pause(2300)
    const add = sheet.getByRole('button', { name: /^Add to dinner/ })
    await hand.swipe(520, { at: { x: VIEWPORT.width * 0.72, y: VIEWPORT.height * 0.6 } })
    await hand.pause(1100)
    await hand.tap(add)
    await sheet.waitFor({ state: 'hidden' })

    // --- 3. The day closes ----------------------------------------------------------------
    await page.getByText(/Added to dinner/).waitFor()
    await page.waitForLoadState('networkidle')
    const dayRefreshed = freshen(page)
    mark('logged')
    // The thumb lifts while the confirmation clears; that clean frame is the poster.
    await hand.vanish()
    await page.getByText(/Added to dinner/).waitFor({ state: 'hidden' })
    mark('poster')
    await hand.pause(350)
    await hand.appear()
    await hand.swipeTo(heading('Dinner'), 150)
    await hand.pause(1100)
    await hand.swipeTo(heading('Vitamins and minerals'), 110)
    await hand.pause(1400)

    // --- 4. The week: days met, what is lacking, the AI's review --------------------------
    await dayRefreshed
    await hand.tap(tab('Week'))
    await page.getByText('Days met').waitFor()
    await page.waitForLoadState('networkidle')
    mark('week')
    await hand.pause(1700)
    await hand.swipeTo(heading(/lacking/), 100)
    await hand.pause(1400)
    await page.getByText('What went well').waitFor()
    await hand.swipeTo(heading('Your week, reviewed'), 90)
    await hand.glide(...REST.edge)
    await hand.pause(2000)

    // --- 5. The other half: Food to Gym ---------------------------------------------------
    await hand.tap(tab('Today'))
    await page.getByText('kcal left').waitFor()
    await hand.pause(500)
    mark('gym')
    await hand.tap(page.getByRole('radio', { name: 'Gym' }))
    await page.getByText('A session is under way.').waitFor()
    await hand.pause(1200)

    // --- 6. The session: tick the last sets, finish ---------------------------------------
    await hand.tap(page.getByText('In progress'))
    const lastLift = page.locator('section[aria-label="Triceps pushdown"]')
    await lastLift.getByText(/Last time/).waitFor()
    await page.waitForLoadState('networkidle')
    await hand.glide(...REST.edge)
    await hand.pause(1100)
    await hand.swipeTo(heading('Triceps pushdown'), 190)
    await hand.pause(500)
    mark('sets')
    for (const set of [1, 2, 3]) {
      await hand.tap(lastLift.getByRole('button', { name: `Mark set ${set} done` }))
      await hand.pause(480)
    }
    await hand.pause(400)
    const finish = page.getByRole('button', { name: 'Finish session' })
    await hand.swipeTo(finish, 600)
    await hand.tap(page.getByRole('radio', { name: 'Good' }))
    await hand.pause(350)
    // The app saves a session a moment after each change; wait for the save that finishes it.
    const finishedSave = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        /\/api\/v1\/workouts\//.test(response.url()) &&
        /"endedAt":"/.test(response.request().postData() ?? '') &&
        response.ok(),
    )
    await hand.tap(finish)
    await page.getByText(/Session finished/).waitFor()
    await finishedSave
    const gymRefreshed = freshen(page)
    mark('finished')
    await hand.pause(1100)
    await gymRefreshed

    // --- 7. Week on week -----------------------------------------------------------------
    await hand.tap(tab('Week'))
    await heading('Week on week').waitFor()
    await page.waitForLoadState('networkidle')
    await hand.pause(2000)

    // --- 8. One lift's trend --------------------------------------------------------------
    const lifts = page.getByRole('link', { name: /^Lifts/ })
    await hand.swipeTo(lifts, 560)
    await hand.pause(400)
    await hand.tap(lifts)
    const bench = page.getByRole('link', { name: /Barbell bench press/ })
    await hand.tap(bench)
    await hand.glide(...REST.edge)
    await heading('Best set per session').waitFor()
    await page.waitForLoadState('networkidle')
    mark('lift')
    const todayRefreshed = freshen(page)
    await hand.pause(2400)
    await todayRefreshed

    // --- 9. The coach, across both halves --------------------------------------------------
    await hand.tap(tab('Today'))
    await page.getByText(/sessions this week/).waitFor()
    await hand.pause(700)
    await hand.tap(
      page.locator('header').getByRole('button', { name: 'Ask the coach', exact: true }),
    )
    const composer = page.locator('#coach-composer')
    await composer.waitFor()
    await hand.pause(450)
    mark('coach')
    await hand.type(composer, QUESTION)
    await hand.pause(350)
    await hand.tap(page.getByRole('button', { name: 'Send' }))
    await page.getByText(QUESTION).first().waitFor()
    await page.waitForFunction(
      (question) =>
        (document.querySelector('main')?.textContent?.length ?? 0) > question.length + 120,
      QUESTION,
      { timeout: 90_000 },
    )
    await settled(page.locator('main'), 1500)
    await page.waitForFunction(
      () =>
        !document.querySelector('main .animate-pulse') &&
        !document.querySelector('[aria-label="The coach is thinking"]'),
    )
    await hand.vanish()
    await hand.pause(2200)
    const endAt = Date.now()

    if (errors.length > 0) throw new Error(`the page threw during the take: ${errors.join(' | ')}`)
    await context.close()
    const [video] = (await readdir(PATHS.raw)).filter((name) => name.endsWith('.webm'))
    if (!video) throw new Error('Playwright wrote no video')
    log(`recorded ${((endAt - startAt) / 1000).toFixed(1)} s`)
    return { video: join(PATHS.raw, video), syncAt, startAt, endAt, marks }
  } catch (error) {
    // What the phone looked like when the take went wrong.
    await page.screenshot({ path: join(PATHS.cache, 'failed.png') }).catch(() => undefined)
    throw error
  } finally {
    await context.close().catch(() => undefined)
    await browser.close().catch(() => undefined)
  }
}
