/**
 * Day and age helpers. A "day" is always the user's local calendar date as `YYYY-MM-DD`
 * (CLAUDE.md non-negotiable 5). Every function here is pure: the caller passes the instant.
 */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** `YYYY-MM-DD` for `instant` in `timeZone`. */
export function localDay(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Whole years between a date of birth and a day, both `YYYY-MM-DD`. */
export function ageOn(dob: string, day: string): number {
  if (!DAY_RE.test(dob) || !DAY_RE.test(day)) throw new Error('ageOn expects YYYY-MM-DD')
  const [by, bm, bd] = dob.split('-').map(Number) as [number, number, number]
  const [dy, dm, dd] = day.split('-').map(Number) as [number, number, number]
  let age = dy - by
  if (dm < bm || (dm === bm && dd < bd)) age -= 1
  return age
}

export function isValidTimeZone(timeZone: string): boolean {
  if (typeof timeZone !== 'string' || timeZone.length === 0 || timeZone.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

/** The IANA zone the browser reports, or UTC when unavailable. */
export function detectTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return zone && isValidTimeZone(zone) ? zone : 'UTC'
  } catch {
    return 'UTC'
  }
}
