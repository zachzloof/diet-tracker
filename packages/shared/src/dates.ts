/**
 * Day and age helpers. A "day" is always the user's local calendar date as `YYYY-MM-DD`
 * (CLAUDE.md non-negotiable 5). Every function here is pure: the caller passes the instant.
 */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

export function isValidDay(day: string): boolean {
  if (!DAY_RE.test(day)) return false
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

export interface LocalTimeParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

/** The wall-clock components of `instant` in `timeZone`. */
export function localTimeParts(instant: Date, timeZone: string): LocalTimeParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0')
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  }
}

/** `YYYY-MM-DD` for `instant` in `timeZone`. */
export function localDay(instant: Date, timeZone: string): string {
  const { year, month, day } = localTimeParts(instant, timeZone)
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Minutes east of UTC for `timeZone` at `instant` (London in summer: 60). */
export function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const p = localTimeParts(instant, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  const truncated = Math.floor(instant.getTime() / 1000) * 1000
  return Math.round((asUtc - truncated) / 60_000)
}

/** The instant at which `day` begins (00:00) in `timeZone`. */
export function startOfLocalDay(day: string, timeZone: string): Date {
  if (!DAY_RE.test(day)) throw new Error('startOfLocalDay expects YYYY-MM-DD')
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const midnightAsUtc = Date.UTC(y, m - 1, d)
  // First guess with the offset in force at UTC midnight, then correct once for a DST edge.
  let guess = new Date(
    midnightAsUtc - zoneOffsetMinutes(new Date(midnightAsUtc), timeZone) * 60_000,
  )
  const offset = zoneOffsetMinutes(guess, timeZone)
  guess = new Date(midnightAsUtc - offset * 60_000)
  return guess
}

/** `day` shifted by `days` calendar days (negative for earlier). */
export function addDays(day: string, days: number): string {
  if (!DAY_RE.test(day)) throw new Error('addDays expects YYYY-MM-DD')
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const shifted = new Date(Date.UTC(y, m - 1, d + days))
  return shifted.toISOString().slice(0, 10)
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
