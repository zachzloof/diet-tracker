import { computeTargets, planExplanationSchema, type Profile } from '@diet-tracker/shared'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { EXPLAIN_PLAN_SYSTEM_PROMPT, buildExplainPlanUserMessage } from '../ai/explain-plan.js'
import { callStructured } from '../ai/openai.js'
import { closeDb } from '../db/client.js'
import { SEED_USERS } from '../db/seed-data.js'
import { buildTargetInput } from '../profile/profile-service.js'

/**
 * `pnpm ai:smoke:plan [--record]`: sends Finn's and Tess's plans to the live model and
 * prints the explanations for a human to read. `--record` also writes Finn's answer to
 * `src/ai/__fixtures__/explain-plan-finn.json` for the schema test. Not run in CI.
 */

const record = process.argv.includes('--record')
const today = '2026-09-25'

for (const seed of SEED_USERS) {
  const profile: Profile = {
    ...seed.profile,
    createdAt: `${today}T00:00:00.000Z`,
    updatedAt: `${today}T00:00:00.000Z`,
  }
  const inputs = buildTargetInput(seed.profile, today)
  const targets = computeTargets(inputs)
  const user = buildExplainPlanUserMessage(profile, inputs, targets)
  const result = await callStructured({
    purpose: 'explain_plan',
    userId: null,
    schemaName: 'plan_explanation',
    schema: planExplanationSchema,
    system: EXPLAIN_PLAN_SYSTEM_PROMPT,
    user,
  })
  const words = [
    result.data.headline,
    ...result.data.paragraphs,
    ...result.data.key_habits,
    ...result.data.caveats,
  ]
    .join(' ')
    .split(/\s+/).length

  console.log(
    `\n=== ${seed.email} (${result.model}, ${result.latencyMs} ms, ${result.inputTokens} in / ${result.outputTokens} out, ${words} words) ===`,
  )
  console.log(`\n${result.data.headline}\n`)
  for (const p of result.data.paragraphs) console.log(`${p}\n`)
  console.log('Key habits:')
  for (const h of result.data.key_habits) console.log(`  - ${h}`)
  if (result.data.caveats.length) {
    console.log('Caveats:')
    for (const c of result.data.caveats) console.log(`  - ${c}`)
  }

  if (record && seed.email.startsWith('finn')) {
    const file = fileURLToPath(
      new URL('../ai/__fixtures__/explain-plan-finn.json', import.meta.url),
    )
    writeFileSync(
      file,
      `${JSON.stringify({ input: { system: EXPLAIN_PLAN_SYSTEM_PROMPT, user }, response: result.data }, null, 2)}\n`,
    )
    console.log(`\nrecorded ${file}`)
  }
}

await closeDb()
