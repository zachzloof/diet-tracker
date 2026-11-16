/**
 * Preloaded into the demo's API and seed processes (`node --import ./clock.mjs`): moves `Date`
 * by DEMO_CLOCK_OFFSET_MS so the app believes it is the pinned demo instant (config.ts,
 * DEMO_NOW) and keeps ticking from there. The app's own code is untouched; it just reads a
 * different clock. The browser gets the same shift from record.ts.
 */
const offset = Number(process.env.DEMO_CLOCK_OFFSET_MS ?? 0)

if (Number.isFinite(offset) && offset !== 0) {
  const RealDate = Date
  class DemoDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(RealDate.now() + offset)
      else super(...args)
    }
    static now() {
      return RealDate.now() + offset
    }
    // Dates made by the runtime itself (file times, structured clones) are still Dates.
    static [Symbol.hasInstance](value) {
      return value instanceof RealDate
    }
  }
  globalThis.Date = DemoDate
}
