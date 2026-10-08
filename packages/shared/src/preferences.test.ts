import { describe, expect, it } from 'vitest'
import type { Gap } from './nutrition/gaps.js'
import { MICRO_KEYS } from './nutrition/dri.js'
import { FOOD_GROUP_KEYS } from './nutrition/nutrients.js'
import {
  DEFAULT_PREFERENCES,
  filterGaps,
  isTargetShown,
  preferencesPatchSchema,
  preferencesSchema,
  shownTargetKeys,
  type Preferences,
} from './preferences.js'

const macrosOnly: Preferences = { water: true, workouts: true, nutrientDetail: 'macros' }
const noWater: Preferences = { water: false, workouts: true, nutrientDetail: 'full' }

function gap(rule: Gap['rule'], key: Gap['key']): Gap {
  return {
    rule,
    key,
    severity: 'low',
    direction: null,
    averageRatio: null,
    daysAffected: 0,
    daysLogged: 5,
    title: '',
    evidence: '',
    suggestions: [],
  }
}

describe('preferencesSchema', () => {
  it('fills every field with "on" when a stored row has nothing yet', () => {
    expect(preferencesSchema.parse({})).toEqual({
      water: true,
      workouts: true,
      nutrientDetail: 'full',
    })
    expect(DEFAULT_PREFERENCES).toEqual(preferencesSchema.parse({}))
  })

  it('keeps what was stored and ignores nothing silently on a patch', () => {
    expect(preferencesSchema.parse({ water: false })).toEqual({
      water: false,
      workouts: true,
      nutrientDetail: 'full',
    })
    expect(preferencesPatchSchema.safeParse({ nutrientDetail: 'macros' }).success).toBe(true)
    expect(preferencesPatchSchema.safeParse({}).success).toBe(false)
    expect(preferencesPatchSchema.safeParse({ theme: 'dark' }).success).toBe(false)
    expect(preferencesPatchSchema.safeParse({ nutrientDetail: 'micros' }).success).toBe(false)
  })
})

describe('isTargetShown', () => {
  it('shows everything by default', () => {
    for (const key of [...MICRO_KEYS, ...FOOD_GROUP_KEYS, 'water_ml', 'sodium_mg'] as const) {
      expect(isTargetShown(key, DEFAULT_PREFERENCES)).toBe(true)
    }
  })

  it('macros mode keeps energy, protein, carbs, fat and fibre and hides the rest', () => {
    expect(
      shownTargetKeys(
        ['energy_kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sodium_mg', 'iron_mg', 'fruit'],
        macrosOnly,
      ),
    ).toEqual(['energy_kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g'])
  })

  it('water follows its own switch in either mode', () => {
    expect(isTargetShown('water_ml', macrosOnly)).toBe(true)
    expect(isTargetShown('water_ml', { ...macrosOnly, water: false })).toBe(false)
    expect(isTargetShown('water_ml', noWater)).toBe(false)
    expect(isTargetShown('iron_mg', noWater)).toBe(true)
  })
})

describe('filterGaps', () => {
  const gaps = [
    gap('protein_short', 'protein_g'),
    gap('micro_short', 'iron_mg'),
    gap('water_short', 'water_ml'),
    gap('food_group_short', 'vegetables'),
    gap('limit_over', 'sodium_mg'),
    gap('logging_gaps', null),
  ]

  it('leaves the list alone by default', () => {
    expect(filterGaps(gaps, DEFAULT_PREFERENCES)).toEqual(gaps)
  })

  it('drops water gaps when water is off and keeps keyless rules', () => {
    expect(filterGaps(gaps, noWater).map((g) => g.rule)).toEqual([
      'protein_short',
      'micro_short',
      'food_group_short',
      'limit_over',
      'logging_gaps',
    ])
  })

  it('in macros mode keeps protein, water and logging only', () => {
    expect(filterGaps(gaps, macrosOnly).map((g) => g.rule)).toEqual([
      'protein_short',
      'water_short',
      'logging_gaps',
    ])
  })
})
