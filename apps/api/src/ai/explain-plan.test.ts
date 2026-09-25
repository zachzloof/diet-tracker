import {
  NO_FLAGS,
  computeTargets,
  planExplanationSchema,
  storedPlanExplanationSchema,
  type Profile,
  type TargetInput,
} from '@diet-tracker/shared'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EXPLAIN_PLAN_SYSTEM_PROMPT, buildExplainPlanUserMessage } from './explain-plan.js'

const finn: Profile = {
  sex: 'male',
  dob: '1998-06-15',
  heightCm: 178,
  weightKg: 75,
  bodyFatPct: null,
  goal: 'gain',
  pace: 'lean',
  goalWeightKg: 80,
  activity: 'high',
  trainingType: 'combat',
  trainingDaysPerWeek: 6,
  dietPattern: 'omnivore',
  allergies: [],
  dislikes: ['liver'],
  timezone: 'Europe/London',
  units: 'metric',
  flags: NO_FLAGS,
  createdAt: '2026-09-25T10:00:00.000Z',
  updatedAt: '2026-09-25T10:00:00.000Z',
}

const inputs: TargetInput = {
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
  goalWeightKg: 80,
  dietPattern: 'omnivore',
  flags: NO_FLAGS,
}

const targets = computeTargets(inputs)

describe('explain-plan prompt', () => {
  it('tells the model to explain, not change, and to use the numbers as given', () => {
    expect(EXPLAIN_PLAN_SYSTEM_PROMPT).toMatch(/Explain, never change/)
    expect(EXPLAIN_PLAN_SYSTEM_PROMPT).toMatch(/at most 180 words/)
    expect(EXPLAIN_PLAN_SYSTEM_PROMPT).toMatch(/exactly 3/)
  })

  it('lists every target with its value, unit and reason, plus the profile and engine notes', () => {
    const message = buildExplainPlanUserMessage(finn, inputs, targets)
    expect(message).toMatch(/Sex: Male, age 28/)
    expect(message).toMatch(/Energy: 3250 kcal \(aim for\)/)
    expect(message).toMatch(/Protein: 150 g \(aim for\)\. 2\.0 g\/kg × 75 kg/)
    expect(message).toMatch(/Sodium: 2300 mg \(at most\)/)
    expect(message).toMatch(/Fibre: 45 g \(at least\)/)
    expect(message).toMatch(/Vegetables: 6 serves/)
    expect(message).toMatch(/Legumes: 1 serves \(for information\)/)
    expect(message).toMatch(/Diet pattern: Omnivore/)
    expect(message).toMatch(/Dislikes: liver/)
    expect(message).toMatch(/Training: Combat sports, 6 days a week/)
    expect(message).toMatch(/Water on rest days: 2750 ml/)
    expect(message).toMatch(/maintenance 2980 kcal, adjustment \+275 kcal/)
    for (const entry of targets.entries) expect(message).toContain(entry.reason)
  })

  it('marks overridden targets so the model does not present the formula as the choice', () => {
    const pinned = computeTargets(inputs, { protein_g: 180 })
    const message = buildExplainPlanUserMessage(finn, inputs, pinned)
    expect(message).toMatch(/Protein: 180 g \(aim for\) \[set by the person\]/)
  })
})

describe('PlanExplanation schema', () => {
  it('accepts the recorded fixture and rejects a missing field', () => {
    const fixture: unknown = JSON.parse(
      readFileSync(new URL('./__fixtures__/explain-plan-finn.json', import.meta.url), 'utf8'),
    )
    const parsed = planExplanationSchema.parse((fixture as { response: unknown }).response)
    expect(parsed.key_habits).toHaveLength(3)
    expect(parsed.headline).toMatch(/3250/)
    expect(
      storedPlanExplanationSchema.safeParse({
        ...parsed,
        model: 'gpt-5',
        generatedAt: '2026-09-25T10:00:00.000Z',
      }).success,
    ).toBe(true)
    const { caveats: _dropped, ...missing } = parsed
    expect(planExplanationSchema.safeParse(missing).success).toBe(false)
  })
})
