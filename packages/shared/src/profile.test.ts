import { describe, expect, it } from 'vitest'
import {
  NO_FLAGS,
  cmToFeetInches,
  feetInchesToCm,
  kgToLb,
  lbToKg,
  profileInputSchema,
} from './profile.js'

const tess = {
  sex: 'female',
  dob: '1996-04-02',
  heightCm: 160,
  weightKg: 50,
  bodyFatPct: null,
  goal: 'lose',
  pace: 'gentle',
  goalWeightKg: 48,
  activity: 'moderate',
  trainingType: 'general',
  trainingDaysPerWeek: 3,
  dietPattern: 'omnivore',
  allergies: [],
  dislikes: ['coriander'],
  timezone: 'Europe/London',
  units: 'metric',
  flags: NO_FLAGS,
}

describe('profileInputSchema', () => {
  it('accepts a complete profile', () => {
    expect(profileInputSchema.safeParse(tess).success).toBe(true)
  })

  it('requires a pace that fits the goal', () => {
    const wrongPace = profileInputSchema.safeParse({ ...tess, pace: 'lean' })
    expect(wrongPace.success).toBe(false)
    const missingPace = profileInputSchema.safeParse({ ...tess, pace: null })
    expect(missingPace.success).toBe(false)
    const maintainWithPace = profileInputSchema.safeParse({
      ...tess,
      goal: 'maintain',
      pace: 'gentle',
      goalWeightKg: null,
    })
    expect(maintainWithPace.success).toBe(false)
    expect(
      profileInputSchema.safeParse({ ...tess, goal: 'maintain', pace: null, goalWeightKg: null })
        .success,
    ).toBe(true)
  })

  it('checks the goal weight direction', () => {
    expect(profileInputSchema.safeParse({ ...tess, goalWeightKg: 55 }).success).toBe(false)
    expect(
      profileInputSchema.safeParse({ ...tess, goal: 'gain', pace: 'lean', goalWeightKg: 48 })
        .success,
    ).toBe(false)
  })

  it('gives plain-words messages for out-of-range numbers', () => {
    const result = profileInputSchema.safeParse({ ...tess, weightKg: 20, heightCm: 300 })
    expect(result.success).toBe(false)
    if (result.success) return
    const messages = result.error.issues.map((issue) => issue.message)
    expect(messages).toContain('Weight should be between 30 and 300 kg')
    expect(messages).toContain('Height should be between 100 and 250 cm')
  })

  it('rejects a bad time zone and a bad date', () => {
    expect(profileInputSchema.safeParse({ ...tess, timezone: 'Nowhere/Town' }).success).toBe(false)
    expect(profileInputSchema.safeParse({ ...tess, dob: '02/04/1996' }).success).toBe(false)
  })
})

describe('unit conversions', () => {
  it('round-trips', () => {
    expect(lbToKg(kgToLb(75))).toBeCloseTo(75, 6)
    expect(feetInchesToCm(5, 10)).toBeCloseTo(177.8, 6)
    expect(cmToFeetInches(178)).toEqual({ feet: 5, inches: 10 })
  })
})
