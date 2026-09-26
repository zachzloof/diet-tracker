import { foodEstimateSchema, type Profile } from '@diet-tracker/shared'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  buildEstimateSystemPrompt,
  buildEstimateUserMessage,
  tidyEstimate,
} from '../ai/estimate.js'
import { callStructured } from '../ai/openai.js'
import { closeDb } from '../db/client.js'
import { SEED_USERS } from '../db/seed-data.js'

/**
 * `pnpm ai:smoke [--record]`: sends the five canonical inputs to the live model as Finn
 * (omnivore, UK) and prints energy, protein, grams and confidence per item for a human to
 * sanity-check. `--record` writes each answer to `src/ai/__fixtures__/estimate-<slug>.json`
 * for the schema tests. Not run in CI.
 */

export const CANONICAL_INPUTS: { slug: string; text: string }[] = [
  { slug: '4-eggs', text: '4 eggs' },
  { slug: 'toast-butter', text: '2 slices wholegrain toast with butter' },
  { slug: 'stir-fry', text: 'chicken stir fry with rice, about a plate' },
  { slug: 'flat-white', text: 'large flat white' },
  { slug: 'protein-shake-banana', text: 'protein shake with a banana' },
]

const record = process.argv.includes('--record')
const seed = SEED_USERS[0]
if (!seed) throw new Error('no seed users')
const profile: Profile = {
  ...seed.profile,
  createdAt: '2026-09-26T00:00:00.000Z',
  updatedAt: '2026-09-26T00:00:00.000Z',
}
/** 08:30 London time, so meal hints lean breakfast where it fits. */
const at = new Date('2026-09-26T07:30:00.000Z')
const system = buildEstimateSystemPrompt(profile, [])

const pad = (value: string | number, width: number) => String(value).padEnd(width)
const num = (value: number, decimals = 0) => value.toFixed(decimals)

for (const { slug, text } of CANONICAL_INPUTS) {
  const user = buildEstimateUserMessage(text, at, profile.timezone)
  const result = await callStructured({
    purpose: 'estimate',
    userId: null,
    schemaName: 'food_estimate',
    schema: foodEstimateSchema,
    system,
    user,
    maxOutputTokens: 6000,
  })
  const estimate = tidyEstimate(result.data)
  const total = estimate.items.reduce(
    (acc, item) => ({
      kcal: acc.kcal + item.nutrients.energy_kcal,
      protein: acc.protein + item.nutrients.protein_g,
      fat: acc.fat + item.nutrients.fat_g,
      carbs: acc.carbs + item.nutrients.carbs_g,
      grams: acc.grams + item.grams,
    }),
    { kcal: 0, protein: 0, fat: 0, carbs: 0, grams: 0 },
  )

  console.log(
    `\n=== "${text}" (${result.model}, ${result.latencyMs} ms, ${result.inputTokens} in / ${result.outputTokens} out, ${estimate.overall_confidence}, meal ${estimate.meal_hint ?? '-'}) ===`,
  )
  console.log(
    `${pad('item', 38)}${pad('qty', 14)}${pad('g', 7)}${pad('kcal', 7)}${pad('P', 6)}${pad('C', 6)}${pad('F', 6)}${pad('conf', 8)}serves`,
  )
  for (const item of estimate.items) {
    const serves = Object.entries(item.food_groups)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k} ${num(v, 1)}`)
      .join(', ')
    console.log(
      `${pad(item.name.slice(0, 37), 38)}${pad(`${num(item.quantity, 1)} ${item.unit}`.slice(0, 13), 14)}${pad(num(item.grams), 7)}${pad(num(item.nutrients.energy_kcal), 7)}${pad(num(item.nutrients.protein_g), 6)}${pad(num(item.nutrients.carbs_g), 6)}${pad(num(item.nutrients.fat_g), 6)}${pad(item.confidence, 8)}${serves}`,
    )
    for (const assumption of item.assumptions) console.log(`    - ${assumption}`)
  }
  console.log(
    `${pad('TOTAL', 52)}${pad(num(total.grams), 7)}${pad(num(total.kcal), 7)}${pad(num(total.protein), 6)}${pad(num(total.carbs), 6)}${pad(num(total.fat), 6)}`,
  )
  if (estimate.clarifying_question) console.log(`  ? ${estimate.clarifying_question}`)

  if (record) {
    const file = fileURLToPath(new URL(`../ai/__fixtures__/estimate-${slug}.json`, import.meta.url))
    writeFileSync(
      file,
      `${JSON.stringify({ input: { text, system, user }, response: result.data }, null, 2)}\n`,
    )
    console.log(`  recorded ${file}`)
  }
}

await closeDb()
