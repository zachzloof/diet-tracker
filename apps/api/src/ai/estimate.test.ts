import {
  FOOD_GROUPS,
  FOOD_GROUP_KEYS,
  NO_FLAGS,
  emptyFoodGroupServes,
  emptyNutrientVector,
  foodEstimateSchema,
  type FoodEstimate,
  type Profile,
} from '@diet-tracker/shared'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  buildEstimateSystemPrompt,
  buildEstimateUserMessage,
  countryFromTimeZone,
  regionFromTimeZone,
  tidyEstimate,
  tidyUrl,
} from './estimate.js'
import { searchWords } from '../log/foods-service.js'

const tess: Profile = {
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
  dietPattern: 'vegan',
  allergies: ['shellfish', 'peanuts'],
  dislikes: ['coriander'],
  timezone: 'Australia/Sydney',
  units: 'metric',
  flags: NO_FLAGS,
  createdAt: '2026-09-25T10:00:00.000Z',
  updatedAt: '2026-09-25T10:00:00.000Z',
}

describe('estimate prompt', () => {
  it('quotes every serve definition verbatim, the units, and the diet pattern with allergies', () => {
    const system = buildEstimateSystemPrompt(tess, [])
    for (const key of FOOD_GROUP_KEYS) {
      expect(system).toContain(`${key}: 1 serve is ${FOOD_GROUPS[key].serveDefinition}`)
    }
    expect(system).toMatch(/energy kcal; protein, carbs, fat, fibre/)
    expect(system).toMatch(/vitamin A \(RAE\), vitamin D, B12 and folate \(DFE\) in mcg/)
    expect(system).toMatch(/TOTAL quantity described, not per 100 g/)
    expect(system).toMatch(/diet pattern is Vegan; allergies or intolerances: shellfish, peanuts/)
    expect(system).toMatch(/one typical serving for Australia/)
    expect(system).toMatch(/more than about 30%/)
    expect(system).toMatch(/no saved foods yet/)
  })

  it('tells the model to search for named products only when the tool is offered', () => {
    const withSearch = buildEstimateSystemPrompt(tess, [], { webSearch: true })
    expect(withSearch).toMatch(/SEARCH THE WEB for that exact product's nutrition information/)
    expect(withSearch).toMatch(/set source_url to the page you took the values from/)
    expect(withSearch).toMatch(/Do not search for generic foods/)
    expect(withSearch).toMatch(/Never invent a URL/)
    const without = buildEstimateSystemPrompt(tess, [], { webSearch: false })
    expect(without).not.toMatch(/SEARCH THE WEB/)
    expect(without).toMatch(/published nutrition label from memory/)
    expect(without).toMatch(/source_url to null/)
  })

  it('lists the user’s verified foods as JSON with their ids for reuse', () => {
    const system = buildEstimateSystemPrompt(tess, [
      {
        id: '019a0000-0000-7000-8000-000000000001',
        name: 'Protein shake',
        brand: 'Bulk',
        basis: 'per_serving',
        servingGrams: 35,
        servingLabel: '1 scoop',
        nutrients: { ...emptyNutrientVector(), energy_kcal: 130, protein_g: 25 },
        foodGroups: emptyFoodGroupServes(),
      },
    ])
    expect(system).toMatch(/reuse its values scaled to the quantity eaten and set matched_food_id/)
    expect(system).toContain('"id":"019a0000-0000-7000-8000-000000000001"')
    expect(system).toContain('"name":"Protein shake"')
    expect(system).toContain('"serving_grams":35')
  })

  it('gives the model the local clock time in the user’s zone', () => {
    // 21:30 UTC on 25 Sep is 07:30 on 26 Sep in Sydney (AEST, +10).
    const user = buildEstimateUserMessage('4 eggs', new Date('2026-09-25T21:30:00Z'), tess.timezone)
    expect(user).toBe('Local time: 07:30.\n\nWhat I ate: 4 eggs')
  })

  it('maps time zones to a portion-size region', () => {
    expect(regionFromTimeZone('Europe/London')).toBe('the United Kingdom')
    expect(regionFromTimeZone('Australia/Melbourne')).toBe('Australia')
    expect(regionFromTimeZone('America/New_York')).toBe('the Americas (New York)')
    expect(regionFromTimeZone('UTC')).toBe('an English-speaking country')
  })

  it('maps time zones to a search country only when it is unambiguous', () => {
    expect(countryFromTimeZone('Europe/London')).toBe('GB')
    expect(countryFromTimeZone('Australia/Sydney')).toBe('AU')
    expect(countryFromTimeZone('America/New_York')).toBe('US')
    expect(countryFromTimeZone('America/Toronto')).toBe('CA')
    expect(countryFromTimeZone('Europe/Paris')).toBeNull()
    expect(countryFromTimeZone('UTC')).toBeNull()
  })
})

describe('tidyEstimate', () => {
  const item: FoodEstimate['items'][number] = {
    name: '  Egg, whole, large, boiled ',
    input_text: '4 eggs',
    quantity: 4,
    unit: ' egg ',
    grams: 200,
    preparation: '  ',
    assumptions: [' assumed large eggs ', '', 'a', 'b', 'c', 'd', 'e'],
    confidence: 'high',
    matched_food_id: '',
    brand: '  ',
    source_url: 'https://groceries.asda.com/product/123 ',
    nutrients: { ...emptyNutrientVector(), energy_kcal: 310, protein_g: 25 },
    food_groups: { ...emptyFoodGroupServes(), protein_foods: 2 },
  }

  it('trims text, caps assumptions at five and turns blanks into null', () => {
    const tidy = tidyEstimate({
      items: [item],
      meal_hint: 'breakfast',
      overall_confidence: 'high',
      clarifying_question: '   ',
    })
    const first = tidy.items[0]!
    expect(first.name).toBe('Egg, whole, large, boiled')
    expect(first.unit).toBe('egg')
    expect(first.preparation).toBeNull()
    expect(first.matched_food_id).toBeNull()
    expect(first.assumptions).toEqual(['assumed large eggs', 'a', 'b', 'c', 'd'])
    expect(first.brand).toBeNull()
    expect(first.source_url).toBe('https://groceries.asda.com/product/123')
    expect(tidy.clarifying_question).toBeNull()
  })

  it('keeps only absolute http(s) source urls', () => {
    expect(tidyUrl('https://www.marksandspencer.com/fries/p/123')).toBe(
      'https://www.marksandspencer.com/fries/p/123',
    )
    expect(tidyUrl('marksandspencer.com/fries')).toBeNull()
    expect(tidyUrl('javascript:alert(1)')).toBeNull()
    expect(tidyUrl('not found')).toBeNull()
    expect(tidyUrl(null)).toBeNull()
    expect(tidyUrl('')).toBeNull()
  })

  it('drops nameless items, fixes a zero quantity and caps the list at 15', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ ...item, name: `Item ${i}` }))
    const tidy = tidyEstimate({
      items: [{ ...item, name: '' }, { ...item, quantity: 0 }, ...many],
      meal_hint: null,
      overall_confidence: 'low',
      clarifying_question: null,
    })
    expect(tidy.items).toHaveLength(15)
    expect(tidy.items[0]?.quantity).toBe(1)
  })
})

describe('searchWords', () => {
  it('keeps the food words and drops filler and quantities', () => {
    expect(
      searchWords('I had 2 slices of wholegrain toast with butter and a large flat white'),
    ).toEqual(['wholegrain', 'toast', 'butter', 'flat', 'white'])
    expect(searchWords('4 eggs')).toEqual(['eggs'])
    expect(searchWords('a b')).toEqual([])
  })
})

describe('FoodEstimate fixtures', () => {
  const dir = fileURLToPath(new URL('./__fixtures__/', import.meta.url))
  const files = readdirSync(dir).filter((f) => f.startsWith('estimate-') && f.endsWith('.json'))

  it('has the seven canonical inputs recorded', () => {
    expect(files.sort()).toEqual([
      'estimate-4-eggs.json',
      'estimate-asda-mozzarella-sticks.json',
      'estimate-flat-white.json',
      'estimate-ms-fries.json',
      'estimate-protein-shake-banana.json',
      'estimate-stir-fry.json',
      'estimate-toast-butter.json',
    ])
  })

  it.each(files)('%s parses with the strict schema and has complete vectors', (file) => {
    const fixture = JSON.parse(readFileSync(`${dir}${file}`, 'utf8')) as { response: unknown }
    const parsed = foodEstimateSchema.parse(fixture.response)
    expect(parsed.items.length).toBeGreaterThan(0)
    for (const item of parsed.items) {
      expect(item.grams).toBeGreaterThan(0)
      expect(item.nutrients.energy_kcal).toBeGreaterThanOrEqual(0)
    }
  })

  it('"4 eggs" lands in the expected ranges from the skill', () => {
    const fixture = JSON.parse(readFileSync(`${dir}estimate-4-eggs.json`, 'utf8')) as {
      response: unknown
    }
    const parsed = tidyEstimate(foodEstimateSchema.parse(fixture.response))
    const total = parsed.items.reduce(
      (acc, item) => ({
        kcal: acc.kcal + item.nutrients.energy_kcal,
        protein: acc.protein + item.nutrients.protein_g,
        fat: acc.fat + item.nutrients.fat_g,
        grams: acc.grams + item.grams,
        proteinServes: acc.proteinServes + item.food_groups.protein_foods,
      }),
      { kcal: 0, protein: 0, fat: 0, grams: 0, proteinServes: 0 },
    )
    expect(total.kcal).toBeGreaterThanOrEqual(280)
    expect(total.kcal).toBeLessThanOrEqual(320)
    expect(total.protein).toBeGreaterThanOrEqual(24)
    expect(total.protein).toBeLessThanOrEqual(28)
    expect(total.fat).toBeGreaterThanOrEqual(19)
    expect(total.fat).toBeLessThanOrEqual(23)
    expect(total.grams).toBeGreaterThanOrEqual(180)
    expect(total.grams).toBeLessThanOrEqual(240)
    expect(total.proteinServes).toBeGreaterThanOrEqual(1.5)
    expect(total.proteinServes).toBeLessThanOrEqual(2.5)
    expect(parsed.clarifying_question).toBeNull()
  })

  it.each(['estimate-asda-mozzarella-sticks.json', 'estimate-ms-fries.json'])(
    '%s names the retailer and links the page the label came from',
    (file) => {
      const fixture = JSON.parse(readFileSync(`${dir}${file}`, 'utf8')) as { response: unknown }
      const parsed = tidyEstimate(foodEstimateSchema.parse(fixture.response))
      expect(parsed.items.length).toBeGreaterThanOrEqual(1)
      const product = parsed.items[0]!
      expect(product.brand).not.toBeNull()
      expect(product.source_url).toMatch(/^https?:\/\//)
      expect(['high', 'medium']).toContain(product.confidence)
    },
  )

  it('the mixed meal returns several items with vegetable and grain serves', () => {
    const fixture = JSON.parse(readFileSync(`${dir}estimate-stir-fry.json`, 'utf8')) as {
      response: unknown
    }
    const parsed = tidyEstimate(foodEstimateSchema.parse(fixture.response))
    expect(parsed.items.length).toBeGreaterThanOrEqual(2)
    const serves = parsed.items.reduce(
      (acc, item) => ({
        vegetables: acc.vegetables + item.food_groups.vegetables,
        grains: acc.grains + item.food_groups.whole_grains,
        protein: acc.protein + item.food_groups.protein_foods,
      }),
      { vegetables: 0, grains: 0, protein: 0 },
    )
    expect(serves.vegetables).toBeGreaterThan(0)
    expect(serves.protein).toBeGreaterThan(0)
  })
})
