import type { Locator, Page } from 'playwright'
import { VIEWPORT } from '../config.js'

/**
 * A hand for the recording: the pointer glides to things before pressing them, text is
 * typed key by key at an uneven human pace, and scrolling is a thumb swipe. Waiting for the
 * app is always on a selector or the network; the only timed waits here are the beats that
 * pace the film (how long a glide or a swipe lasts, how long the viewer gets to read).
 */

interface DemoCursor {
  show(): void
  hide(): void
  position(): { x: number; y: number }
  swipe(cx: number, cy: number, dy: number, ms: number): Promise<number>
}

declare global {
  interface Window {
    __demoCursor: DemoCursor
  }
}

/** Small repeatable variation, so two takes are identical but nothing looks metronomic. */
function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}

const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

export class Hand {
  private x = VIEWPORT.width * 0.72
  private y = VIEWPORT.height * 0.62
  private readonly random = seeded(7)

  constructor(private readonly page: Page) {}

  /** A beat for the viewer: time to take in what just happened. */
  async pause(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms)
  }

  /** Brings the dot in where the hand rests. */
  async appear(): Promise<void> {
    await this.page.mouse.move(this.x, this.y)
    await this.page.evaluate(() => window.__demoCursor.show())
  }

  async vanish(): Promise<void> {
    await this.page.evaluate(() => window.__demoCursor.hide())
  }

  /** Glides to a point along a slightly bowed path, slower over longer distances. */
  async glide(toX: number, toY: number): Promise<void> {
    const fromX = this.x
    const fromY = this.y
    const distance = Math.hypot(toX - fromX, toY - fromY)
    if (distance < 2) return
    const duration = Math.min(620, 230 + distance * 0.85)
    const bow = Math.min(26, distance * 0.08) * (this.random() < 0.5 ? -1 : 1)
    const normalX = -(toY - fromY) / distance
    const normalY = (toX - fromX) / distance
    const began = Date.now()
    for (;;) {
      const t = Math.min(1, (Date.now() - began) / duration)
      const k = easeInOut(t)
      const arc = Math.sin(Math.PI * k) * bow
      this.x = fromX + (toX - fromX) * k + normalX * arc
      this.y = fromY + (toY - fromY) * k + normalY * arc
      await this.page.mouse.move(this.x, this.y)
      if (t >= 1) break
      await this.page.waitForTimeout(8)
    }
  }

  /** Where on the element the finger lands: the middle, or a fraction across and down. */
  private async pointOn(target: Locator, at: { x: number; y: number }): Promise<[number, number]> {
    await target.waitFor({ state: 'visible' })
    const box = await target.boundingBox()
    if (!box) throw new Error('demo: the element to tap has no box')
    const x = box.x + box.width * at.x
    const y = box.y + box.height * at.y
    if (y < 0 || y > VIEWPORT.height || x < 0 || x > VIEWPORT.width) {
      throw new Error(`demo: the element to tap is off screen at ${Math.round(x)},${Math.round(y)}`)
    }
    return [x, y]
  }

  /** Glides to the element and taps it, holding the press long enough to see. */
  async tap(target: Locator, at: { x: number; y: number } = { x: 0.5, y: 0.5 }): Promise<void> {
    const [x, y] = await this.pointOn(target, at)
    await this.glide(x, y)
    await this.pause(110)
    await this.page.mouse.down()
    await this.pause(95)
    await this.page.mouse.up()
  }

  /** Taps a field and types into it, a key at a time, a little slower after spaces and commas. */
  async type(field: Locator, text: string): Promise<void> {
    await this.tap(field, { x: 0.35, y: 0.5 })
    await this.pause(280)
    for (const character of text) {
      await this.page.keyboard.type(character)
      const base = 38 + this.random() * 46
      const thinking = character === ' ' ? 30 : /[,:.?]/.test(character) ? 150 : 0
      await this.pause(base + thinking)
    }
  }

  /**
   * A thumb swipe: scrolls whatever is under the finger by `dy` CSS pixels (positive moves
   * down the page), with the dot dragging the other way. Returns how far it really went.
   */
  async swipe(
    dy: number,
    options: { at?: { x: number; y: number }; ms?: number } = {},
  ): Promise<number> {
    const at = options.at ?? { x: VIEWPORT.width * 0.7, y: VIEWPORT.height * 0.56 }
    const ms = options.ms ?? Math.min(1100, 520 + Math.abs(dy) * 0.75)
    await this.glide(at.x, at.y)
    const moved = await this.page.evaluate(
      ([x, y, distance, duration]) => window.__demoCursor.swipe(x, y, distance, duration),
      [at.x, at.y, dy, ms] as const,
    )
    const resting = await this.page.evaluate(() => window.__demoCursor.position())
    this.x = resting.x
    this.y = resting.y
    await this.page.mouse.move(this.x, this.y)
    return moved
  }

  /** Swipes until the element's top sits `top` pixels down the screen. */
  async swipeTo(target: Locator, top: number): Promise<void> {
    await target.waitFor({ state: 'attached' })
    const box = await target.boundingBox()
    if (!box) throw new Error('demo: the element to scroll to has no box')
    const dy = box.y - top
    if (Math.abs(dy) > 4) await this.swipe(dy)
  }
}
