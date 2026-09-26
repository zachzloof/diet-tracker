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

describe('startOfLocalDay and addDays', () => {
  it('finds midnight in the zone, including across DST', async () => {
    const { startOfLocalDay, addDays, zoneOffsetMinutes, localTimeParts } =
      await import('./dates.js')
    expect(startOfLocalDay('2026-09-26', 'UTC').toISOString()).toBe('2026-09-26T00:00:00.000Z')
    expect(startOfLocalDay('2026-09-26', 'Europe/London').toISOString()).toBe(
      '2026-09-25T23:00:00.000Z',
    )
    expect(startOfLocalDay('2026-01-15', 'Europe/London').toISOString()).toBe(
      '2026-01-15T00:00:00.000Z',
    )
    expect(startOfLocalDay('2026-09-26', 'Australia/Sydney').toISOString()).toBe(
      '2026-09-25T14:00:00.000Z',
    )
    // The day after Sydney's DST start (first Sunday of October 2026 is the 4th).
    expect(startOfLocalDay('2026-10-05', 'Australia/Sydney').toISOString()).toBe(
      '2026-10-04T13:00:00.000Z',
    )
    expect(zoneOffsetMinutes(new Date('2026-07-01T12:00:00Z'), 'Europe/London')).toBe(60)
    expect(zoneOffsetMinutes(new Date('2026-07-01T12:00:00Z'), 'America/Los_Angeles')).toBe(-420)
    expect(localTimeParts(new Date('2026-09-26T00:30:00Z'), 'Europe/London').hour).toBe(1)
    expect(addDays('2026-09-26', -1)).toBe('2026-09-25')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
  })
})
