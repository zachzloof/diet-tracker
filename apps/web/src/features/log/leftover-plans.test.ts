import { emptyFoodGroupServes, emptyNutrientVector, type LogEntry } from '@diet-tracker/shared'
import { describe, expect, it } from 'vitest'
import { weekdayLong } from '@/lib/format'
import { leftoverNotice } from './leftover-plans'

const TODAY = '2026-11-04'
const YESTERDAY = '2026-11-03'
const TWO_BACK = '2026-11-02'
const GROUP = '0192a1b2-0000-7000-8000-000000000001'

function entry(overrides: Partial<LogEntry> & { name: string }): LogEntry {
  return {
    id: `id-${overrides.name}`,
    day: YESTERDAY,
    loggedAt: '2026-11-03T08:00:00.000Z',
    meal: 'dinner',
    planned: true,
    quantity: 1,
    unit: 'serving',
    grams: 100,
    nutrients: { ...emptyNutrientVector(), energy_kcal: 300 },
    foodGroups: emptyFoodGroupServes(),
    source: 'manual',
    sourceUrl: null,
    foodId: null,
    aiCallId: null,
    assumptions: [],
    confidence: null,
    groupId: null,
    groupName: null,
    createdAt: '2026-11-03T08:00:00.000Z',
    updatedAt: '2026-11-03T08:00:00.000Z',
    ...overrides,
  }
}

const curry = entry({ name: 'Curry' })
const soup = entry({ name: 'Soup' })

describe('leftoverNotice', () => {
  it('says nothing with no plans left', () => {
    expect(leftoverNotice([], TODAY)).toBeNull()
    expect(
      leftoverNotice(
        [
          { day: YESTERDAY, entries: [] },
          { day: TWO_BACK, entries: [] },
        ],
        TODAY,
      ),
    ).toBeNull()
  })

  it('ignores food that was eaten', () => {
    const eaten = entry({ name: 'Toast', planned: false })
    expect(leftoverNotice([{ day: YESTERDAY, entries: [eaten] }], TODAY)).toBeNull()
  })

  it('names yesterday', () => {
    expect(leftoverNotice([{ day: YESTERDAY, entries: [curry] }], TODAY)).toEqual({
      day: YESTERDAY,
      text: '1 plan from yesterday not ticked',
    })
  })

  it('names the weekday further back', () => {
    expect(leftoverNotice([{ day: TWO_BACK, entries: [curry, soup] }], TODAY)).toEqual({
      day: TWO_BACK,
      text: `2 plans from ${weekdayLong(TWO_BACK)} not ticked`,
    })
  })

  it('counts a saved meal as one plan, as the list shows it', () => {
    const parts = ['Beef', 'Potatoes'].map((name) =>
      entry({ name, groupId: GROUP, groupName: 'Sunday roast' }),
    )
    expect(leftoverNotice([{ day: YESTERDAY, entries: parts }], TODAY)?.text).toBe(
      '1 plan from yesterday not ticked',
    )
  })

  it('adds up two days and opens the oldest, which clears first', () => {
    const notice = leftoverNotice(
      [
        { day: YESTERDAY, entries: [curry, soup] },
        { day: TWO_BACK, entries: [curry] },
      ],
      TODAY,
    )
    expect(notice).toEqual({ day: TWO_BACK, text: '3 plans from earlier not ticked' })
  })
})
