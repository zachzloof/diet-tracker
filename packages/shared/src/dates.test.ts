import { describe, expect, it } from 'vitest'
import { ageOn, isValidTimeZone, localDay } from './dates.js'

describe('localDay', () => {
  it('is the calendar date in the given zone, not the server zone', () => {
    const instant = new Date('2026-09-25T23:30:00Z')
    expect(localDay(instant, 'UTC')).toBe('2026-09-25')
    expect(localDay(instant, 'Europe/London')).toBe('2026-09-26')
    expect(localDay(instant, 'Australia/Sydney')).toBe('2026-09-26')
    expect(localDay(instant, 'America/Los_Angeles')).toBe('2026-09-25')
  })

  it('handles the early hours before a zone has crossed midnight', () => {
    const instant = new Date('2026-01-01T03:00:00Z')
    expect(localDay(instant, 'America/New_York')).toBe('2025-12-31')
  })
})

describe('ageOn', () => {
  it('counts whole years, birthday inclusive', () => {
    expect(ageOn('1998-03-14', '2026-03-13')).toBe(27)
    expect(ageOn('1998-03-14', '2026-03-14')).toBe(28)
    expect(ageOn('1998-03-14', '2026-09-25')).toBe(28)
    expect(ageOn('2000-02-29', '2026-02-28')).toBe(25)
    expect(ageOn('2000-02-29', '2026-03-01')).toBe(26)
  })

  it('rejects anything that is not YYYY-MM-DD', () => {
    expect(() => ageOn('14/03/1998', '2026-09-25')).toThrow()
  })
})

describe('isValidTimeZone', () => {
  it('accepts IANA names and rejects junk', () => {
    expect(isValidTimeZone('Europe/London')).toBe(true)
    expect(isValidTimeZone('UTC')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
  })
})
