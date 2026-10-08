import { emptyFoodGroupServes, emptyNutrientVector, type LogEntry } from '@diet-tracker/shared'
import { describe, expect, it } from 'vitest'
import { groupEntries, groupMembers, groupTotals, mealSections } from './day-groups'

const GROUP = '0192a1b2-0000-7000-8000-000000000001'

function entry(overrides: Partial<LogEntry> & { name: string; kcal?: number }): LogEntry {
  const { kcal = 100, ...rest } = overrides
  return {
    id: `id-${rest.name}`,
    day: '2026-10-08',
    loggedAt: '2026-10-08T08:00:00.000Z',
    meal: 'breakfast',
    quantity: 1,
    unit: 'serving',
    grams: 100,
    nutrients: { ...emptyNutrientVector(), energy_kcal: kcal, protein_g: 10 },
    foodGroups: emptyFoodGroupServes(),
    source: 'library',
    foodId: null,
    aiCallId: null,
    assumptions: [],
    confidence: null,
    groupId: null,
    groupName: null,
    createdAt: '2026-10-08T08:00:00.000Z',
    updatedAt: '2026-10-08T08:00:00.000Z',
    ...rest,
  }
}

const oats = entry({ name: 'Oats', groupId: GROUP, groupName: 'Protein oats', kcal: 300 })
const whey = entry({ name: 'Whey', groupId: GROUP, groupName: 'Protein oats', kcal: 120 })
const banana = entry({ name: 'Banana', kcal: 90 })
const water = entry({
  name: 'Water',
  unit: 'ml',
  kcal: 0,
  nutrients: { ...emptyNutrientVector(), water_ml: 250 },
})

describe('groupEntries', () => {
  it('collapses ingredients that share a group into one row, in order of first appearance', () => {
    const rows = groupEntries([banana, oats, whey])
    expect(rows.map((row) => row.kind)).toEqual(['entry', 'group'])
    const group = rows[1]
    if (group?.kind !== 'group') throw new Error('expected a group row')
    expect(group.name).toBe('Protein oats')
    expect(group.entries.map((e) => e.name)).toEqual(['Oats', 'Whey'])
    expect(group.kcal).toBe(420)
    expect(group.grams).toBe(200)
  })

  it('lists an ungrouped entry on its own and never merges different groups', () => {
    const other = entry({ name: 'Rice', groupId: GROUP.replace(/1$/, '2'), groupName: 'Lunch box' })
    const rows = groupEntries([oats, other, whey])
    expect(rows.map((row) => (row.kind === 'group' ? row.name : row.entry.name))).toEqual([
      'Protein oats',
      'Lunch box',
    ])
  })
})

describe('mealSections', () => {
  it('splits by meal of the day, leaves water out and drops empty meals', () => {
    const lunch = entry({ name: 'Salad', meal: 'lunch', kcal: 200 })
    const sections = mealSections([water, oats, whey, lunch, banana])
    expect(sections.map((s) => s.meal)).toEqual(['breakfast', 'lunch'])
    expect(sections[0]?.kcal).toBe(510)
    expect(sections[0]?.rows).toHaveLength(2)
    expect(sections[1]?.rows).toHaveLength(1)
  })
})

describe('groupMembers and groupTotals', () => {
  it('finds the ingredients of one logged meal and adds them up', () => {
    const members = groupMembers([banana, oats, whey], GROUP)
    expect(members.map((e) => e.name)).toEqual(['Oats', 'Whey'])
    expect(groupTotals(members).totals.energy_kcal).toBe(420)
    expect(groupTotals(members).totals.protein_g).toBe(20)
  })
})
