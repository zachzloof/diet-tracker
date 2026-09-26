import { describe, expect, it } from 'vitest'
import { NO_FLAGS } from '../profile.js'
import { suggestionsFor } from './gap-suggestions.js'
import { findGaps, type Gap } from './gaps.js'
import { emptyNutrientVector, type FoodGroupServes, type NutrientVector } from './nutrients.js'
import { evaluateDay, type DayScore } from './scoring.js'
import { computeTargets, type TargetInput } from './targets.js'
import { emptyDayScore } from './week.js'

/** Finn: energy 3250, protein 150, fibre 45, sodium 2300, water 3250, vegetables 6, iron 8. */
const finn: TargetInput = {
  sex: 'male',
  age: 28,
  heightCm: 178,
  weightKg: 75,
  bodyFatPct: null,
  activity: 'high',
  trainingType: 'combat',
  trainingDaysPerWeek: 6,
  goal: 'gain',
  pace: 'lean',
  goalWeightKg: null,
  dietPattern: 'omnivore',
  flags: NO_FLAGS,
}
const targets = computeTargets(finn)
const profile = { dietPattern: 'omnivore' as const, allergies: [], dislikes: [] }

/** A comfortably met day: everything on target, so a rule fires only where a test changes it. */
const GOOD: NutrientVector = {
  ...emptyNutrientVector(),
  energy_kcal: 3250,
  protein_g: 150,
  carbs_g: 460,
  fat_g: 90,
  fiber_g: 45,
  sodium_mg: 1800,
  saturated_fat_g: 30,
  added_sugar_g: 40,
  potassium_mg: 3400,
  calcium_mg: 1000,
  iron_mg: 8,
  magnesium_mg: 400,
  zinc_mg: 11,
  vitamin_a_ug: 900,
  vitamin_c_mg: 90,
  vitamin_d_ug: 15,
  vitamin_b12_ug: 2.4,
  folate_ug: 400,
  water_ml: 3250,
}
const GOOD_GROUPS: FoodGroupServes = {
  vegetables: 6,
  fruit: 2,
  whole_grains: 6,
  protein_foods: 3,
  dairy_or_alt: 2.5,
  legumes: 1,
  nuts_seeds: 1,
}

function scored(
  nutrients: Partial<NutrientVector> = {},
  foodGroups: Partial<FoodGroupServes> = {},
): DayScore {
  return evaluateDay(
    {
      totals: { ...GOOD, ...nutrients },
      foodGroups: { ...GOOD_GROUPS, ...foodGroups },
      entryCount: 4,
    },
    targets,
  )
}

function week(days: DayScore[]): DayScore[] {
  while (days.length < 7) days.push(scored())
  return days
}

const rules = (gaps: Gap[]) => gaps.map((g) => `${g.rule}${g.key ? `:${g.key}` : ''}`)

describe('findGaps', () => {
  it('asks for more days when fewer than 4 are logged', () => {
    const gaps = findGaps([scored(), scored(), scored(), emptyDayScore()], profile)
    expect(gaps).toHaveLength(1)
    expect(gaps[0]).toMatchObject({ rule: 'not_enough_days', daysLogged: 3, severity: 'low' })
    expect(gaps[0]?.evidence).toMatch(/Only 3 of the last 4 days were logged/)
    expect(gaps[0]?.suggestions.length).toBeGreaterThan(0)
  })

  it('returns nothing for a perfect week', () => {
    expect(findGaps(week([]), profile)).toEqual([])
  })

  it('flags energy off plan from the average, in either direction', () => {
    const low = findGaps(
      week([
        scored({ energy_kcal: 2400 }),
        scored({ energy_kcal: 2400 }),
        scored({ energy_kcal: 2500 }),
      ]),
      profile,
    )
    // (2400 + 2400 + 2500 + 4 × 3250) / 7 = 2900 → 0.892; still inside 0.85 to 1.15.
    expect(rules(low)).toEqual([])

    const lower = findGaps(
      week([
        scored({ energy_kcal: 2000 }),
        scored({ energy_kcal: 2000 }),
        scored({ energy_kcal: 2000 }),
        scored({ energy_kcal: 2000 }),
      ]),
      profile,
    )
    // (4 × 2000 + 3 × 3250) / 7 = 2535.7 → 0.780.
    expect(lower[0]).toMatchObject({
      rule: 'energy_off_plan',
      severity: 'high',
      direction: 'under',
      daysAffected: 4,
    })
    expect(lower[0]?.averageRatio).toBeCloseTo(0.78, 2)
    expect(lower[0]?.evidence).toBe(
      'Energy averaged 78% of target over 7 logged days, below the 85% line.',
    )

    const higher = findGaps(
      week([scored({ energy_kcal: 5000 }), scored({ energy_kcal: 5000 })]),
      profile,
    )
    // (2 × 5000 + 5 × 3250) / 7 = 3750 → 1.154.
    expect(higher[0]).toMatchObject({ rule: 'energy_off_plan', direction: 'over', daysAffected: 2 })
  })

  it('flags protein short or close on 3 or more days', () => {
    const two = findGaps(week([scored({ protein_g: 100 }), scored({ protein_g: 130 })]), profile)
    expect(rules(two)).toEqual([])
    const three = findGaps(
      week([scored({ protein_g: 100 }), scored({ protein_g: 130 }), scored({ protein_g: 120 })]),
      profile,
    )
    expect(three[0]).toMatchObject({ rule: 'protein_short', severity: 'high', daysAffected: 3 })
    expect(three[0]?.evidence).toMatch(/Protein was short or close on 3 of 7 logged days/)
  })

  it('flags a limit over on 3 or more days, averaging the over days', () => {
    const gaps = findGaps(
      week([scored({ sodium_mg: 3450 }), scored({ sodium_mg: 2760 }), scored({ sodium_mg: 4600 })]),
      profile,
    )
    // Ratios 1.5, 1.2, 2.0 → average 1.567 on the over days.
    expect(gaps[0]).toMatchObject({
      rule: 'limit_over',
      key: 'sodium_mg',
      severity: 'medium',
      direction: 'over',
      daysAffected: 3,
    })
    expect(gaps[0]?.averageRatio).toBeCloseTo(1.567, 3)
    expect(gaps[0]?.evidence).toBe(
      'Sodium was over the limit on 3 of 7 logged days, averaging 157% of the limit on those days.',
    )
  })

  it('does not count a limit that is merely close', () => {
    const gaps = findGaps(
      week([scored({ sodium_mg: 2600 }), scored({ sodium_mg: 2600 }), scored({ sodium_mg: 2600 })]),
      profile,
    )
    expect(rules(gaps)).toEqual([])
  })

  it('flags fibre under 75% on 4 or more days and food groups under 60% on 4 or more', () => {
    const gaps = findGaps(
      week([
        scored({ fiber_g: 20 }, { vegetables: 2 }),
        scored({ fiber_g: 20 }, { vegetables: 2 }),
        scored({ fiber_g: 20 }, { vegetables: 2 }),
        scored({ fiber_g: 33 }, { vegetables: 3.5 }),
      ]),
      profile,
    )
    expect(rules(gaps)).toEqual(['food_group_short:vegetables', 'fibre_short:fiber_g'])
    const vegetables = gaps[0]!
    // (4 × 2 + 3 × 6) / 7 … the average uses all logged days: (2+2+2+3.5+6+6+6)/7 = 3.93.
    expect(vegetables.evidence).toBe(
      'Vegetables were under 60% of target on 4 of 7 logged days (average 3.9 of 6 serves).',
    )
    expect(gaps[1]?.evidence).toBe(
      'Fibre was under 75% of target on 4 of 7 logged days (average 32.6 of 45 g).',
    )
  })

  it('flags a micronutrient under 70% on 5 or more days and water under 70% on 4 or more', () => {
    const gaps = findGaps(
      week([
        scored({ iron_mg: 4, water_ml: 2000 }),
        scored({ iron_mg: 4, water_ml: 2000 }),
        scored({ iron_mg: 4, water_ml: 2000 }),
        scored({ iron_mg: 4, water_ml: 2000 }),
        scored({ iron_mg: 5.5 }),
      ]),
      profile,
    )
    expect(rules(gaps)).toEqual(['micro_short:iron_mg', 'water_short:water_ml'])
    expect(gaps[0]).toMatchObject({ severity: 'low', daysAffected: 5, direction: 'under' })
    expect(gaps[0]?.evidence).toBe(
      'Iron was under 70% of target on 5 of 7 logged days (average 5.4 of 8 mg).',
    )
    expect(gaps[1]?.evidence).toBe(
      'Water was under 70% of target on 4 of 7 logged days (average 78%).',
    )
  })

  it('needs 5 days for a micronutrient, so 4 short days are not a gap', () => {
    const gaps = findGaps(
      week([
        scored({ iron_mg: 4 }),
        scored({ iron_mg: 4 }),
        scored({ iron_mg: 4 }),
        scored({ iron_mg: 4 }),
      ]),
      profile,
    )
    expect(rules(gaps)).toEqual([])
  })

  it('flags 3 or more unlogged days once at least 4 are logged', () => {
    const gaps = findGaps(
      [scored(), scored(), scored(), scored(), emptyDayScore(), emptyDayScore(), emptyDayScore()],
      profile,
    )
    expect(gaps).toHaveLength(1)
    expect(gaps[0]).toMatchObject({ rule: 'logging_gaps', key: null, daysAffected: 3 })
    expect(gaps[0]?.evidence).toBe('3 of the last 7 days had nothing logged.')
  })

  it('ranks by severity, then distance from target, then key', () => {
    const gaps = findGaps(
      week([
        // energy under (high), protein (high), sodium over (medium), fibre (medium),
        // vegetables (medium), iron (low), water (low)
        scored(
          {
            energy_kcal: 2000,
            protein_g: 100,
            sodium_mg: 3450,
            fiber_g: 10,
            iron_mg: 2,
            water_ml: 1000,
          },
          { vegetables: 1 },
        ),
        scored(
          {
            energy_kcal: 2000,
            protein_g: 100,
            sodium_mg: 3450,
            fiber_g: 10,
            iron_mg: 2,
            water_ml: 1000,
          },
          { vegetables: 1 },
        ),
        scored(
          {
            energy_kcal: 2000,
            protein_g: 100,
            sodium_mg: 3450,
            fiber_g: 10,
            iron_mg: 2,
            water_ml: 1000,
          },
          { vegetables: 1 },
        ),
        scored(
          { energy_kcal: 2000, protein_g: 150, fiber_g: 10, iron_mg: 2, water_ml: 1000 },
          { vegetables: 1 },
        ),
        scored({ energy_kcal: 2000, iron_mg: 2 }),
      ]),
      profile,
    )
    // Energy average (5 × 2000 + 2 × 3250) / 7 = 2357 → 0.725 (distance 0.275).
    // Protein average (3 × 100 + 4 × 150) / 7 = 128.6 → 0.857 (distance 0.143).
    // Sodium over days average 1.5 (distance 0.5); vegetables (4 × 1 + 3 × 6) / 7 = 3.14 → 0.524
    // (distance 0.476); fibre (4 × 10 + 3 × 45) / 7 = 25 → 0.556 (distance 0.444).
    // Iron (5 × 2 + 2 × 8) / 7 = 3.71 → 0.464 (distance 0.536); water (4 × 1000 + 3 × 3250) / 7
    // = 2107 → 0.648 (distance 0.352).
    expect(rules(gaps)).toEqual([
      'energy_off_plan:energy_kcal',
      'protein_short:protein_g',
      'limit_over:sodium_mg',
      'food_group_short:vegetables',
      'fibre_short:fiber_g',
      'micro_short:iron_mg',
      'water_short:water_ml',
    ])
  })

  it('breaks exact ties alphabetically by key', () => {
    // Iron at 50% and zinc at 50% on every day: same severity and distance.
    const gaps = findGaps(
      week([
        scored({ iron_mg: 4, zinc_mg: 5.5 }),
        scored({ iron_mg: 4, zinc_mg: 5.5 }),
        scored({ iron_mg: 4, zinc_mg: 5.5 }),
        scored({ iron_mg: 4, zinc_mg: 5.5 }),
        scored({ iron_mg: 4, zinc_mg: 5.5 }),
      ]),
      profile,
    )
    // Averages: iron (5 × 4 + 2 × 8) / 7 = 5.14 → 0.643; zinc (5 × 5.5 + 2 × 11) / 7 = 7.07 → 0.643.
    expect(rules(gaps)).toEqual(['micro_short:iron_mg', 'micro_short:zinc_mg'])
  })
})

describe('suggestionsFor', () => {
  it('drops meat for vegetarians, fish for vegans, and tells vegans where B12 comes from', () => {
    const omnivore = suggestionsFor('iron_mg', profile)
    expect(omnivore[0]).toMatch(/red meat/)
    const vegetarian = suggestionsFor('iron_mg', { ...profile, dietPattern: 'vegetarian' })
    expect(vegetarian.join(' ')).not.toMatch(/meat|sardines/)
    expect(vegetarian).toHaveLength(3)

    const veganB12 = suggestionsFor('vitamin_b12_ug', { ...profile, dietPattern: 'vegan' })
    expect(veganB12).toEqual([
      'Fortified nutritional yeast',
      'Fortified plant milk and cereals',
      'A B12 supplement',
    ])
    const omnivoreB12 = suggestionsFor('vitamin_b12_ug', profile)
    expect(omnivoreB12.join(' ')).not.toMatch(/supplement|nutritional yeast/)
  })

  it('drops allergens and dislikes, matching loosely and case-insensitively', () => {
    const noFish = suggestionsFor('vitamin_d_ug', { ...profile, allergies: ['Fish'] })
    expect(noFish.join(' ')).not.toMatch(/salmon/)
    const noNuts = suggestionsFor('magnesium_mg', { ...profile, allergies: ['tree nuts'] })
    expect(noNuts.join(' ')).not.toMatch(/Almonds/)
    const noLiver = suggestionsFor('vitamin_a_ug', { ...profile, dislikes: ['liver'] })
    expect(noLiver.join(' ')).not.toMatch(/liver/i)
    expect(noLiver).toHaveLength(3)
  })

  it('caps at three and keeps the map order', () => {
    expect(suggestionsFor('fiber_g', profile)).toEqual([
      'Oats or a wholegrain cereal at breakfast',
      'Lentils, chickpeas or beans in one meal a day',
      'Wholegrain bread, brown rice and wholewheat pasta',
    ])
  })
})
