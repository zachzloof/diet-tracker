import { describe, expect, it } from 'vitest'
import {
  entryDayProblem,
  firstPlanDay,
  isPlanOnlyDay,
  lastPlanDay,
  MAX_PLAN_DAYS_AHEAD,
  PLAN_GRACE_DAYS,
  planExpiresAfter,
} from './planned.js'
import { createEntriesRequestSchema, updateGroupRequestSchema } from './schemas.js'

const TODAY = '2026-11-04'

describe('how far ahead food can go', () => {
  it('plans as far as tomorrow', () => {
    expect(MAX_PLAN_DAYS_AHEAD).toBe(1)
    expect(lastPlanDay(TODAY)).toBe('2026-11-05')
    expect(lastPlanDay('2026-12-31')).toBe('2027-01-01')
  })

  it('treats only days after today as plan-only', () => {
    expect(isPlanOnlyDay('2026-11-05', TODAY)).toBe(true)
    expect(isPlanOnlyDay(TODAY, TODAY)).toBe(false)
    expect(isPlanOnlyDay('2026-11-03', TODAY)).toBe(false)
  })
})

describe('how long a plan lasts', () => {
  it('outlives its day by 48 hours', () => {
    expect(PLAN_GRACE_DAYS).toBe(2)
    expect(planExpiresAfter('2026-11-02')).toBe(TODAY)
    expect(planExpiresAfter('2026-12-31')).toBe('2027-01-02')
  })

  it('keeps today and the two days before it open to plans', () => {
    expect(firstPlanDay(TODAY)).toBe('2026-11-02')
    expect(firstPlanDay('2027-01-01')).toBe('2026-12-30')
  })
})

describe('entryDayProblem', () => {
  it('lets eaten food sit on today or any past day', () => {
    expect(entryDayProblem(TODAY, false, TODAY)).toBeNull()
    expect(entryDayProblem('2026-10-01', false, TODAY)).toBeNull()
  })

  it('lets a plan sit on today and as far back as a plan is kept', () => {
    expect(entryDayProblem(TODAY, true, TODAY)).toBeNull()
    expect(entryDayProblem('2026-11-02', true, TODAY)).toBeNull()
    expect(entryDayProblem('2026-11-01', true, TODAY)).toMatch(/too far back/)
  })

  it('lets tomorrow hold a plan and nothing else', () => {
    expect(entryDayProblem('2026-11-05', true, TODAY)).toBeNull()
    expect(entryDayProblem('2026-11-05', false, TODAY)).toMatch(/can only be planned/)
  })

  it('refuses anything past tomorrow, planned or not', () => {
    expect(entryDayProblem('2026-11-06', true, TODAY)).toMatch(/as far as tomorrow/)
    expect(entryDayProblem('2026-11-06', false, TODAY)).toMatch(/as far as tomorrow/)
  })
})

describe('the planned flag on the wire', () => {
  it('is optional on a create, so a request queued before this shipped still parses', () => {
    expect(createEntriesRequestSchema.shape.planned.safeParse(undefined).success).toBe(true)
    expect(createEntriesRequestSchema.shape.planned.safeParse(true).success).toBe(true)
  })

  it('moves a whole meal on and off the plan', () => {
    expect(updateGroupRequestSchema.safeParse({ planned: false }).success).toBe(true)
    expect(updateGroupRequestSchema.safeParse({}).success).toBe(false)
  })
})
