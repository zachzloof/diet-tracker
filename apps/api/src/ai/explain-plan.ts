import {
  ACTIVITY_LABELS,
  DIET_PATTERN_LABELS,
  FOOD_GROUPS,
  GOAL_LABELS,
  NUTRIENTS,
  PACE_LABELS,
  SEX_LABELS,
  TRAINING_TYPE_LABELS,
  planExplanationSchema,
  type FoodGroupKey,
  type NutrientKey,
  type PlanExplanation,
  type Profile,
  type StoredPlanExplanation,
  type TargetEntry,
  type TargetInput,
  type Targets,
} from '@diet-tracker/shared'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { targetVersions, type TargetVersionRow } from '../db/schema/index.js'
import { callStructured } from './openai.js'

/**
 * Purpose `explain_plan`: the AI reads the engine's targets and their reasons and writes
 * the plain-English version. It explains; it never sets or changes a number.
 */

export const EXPLAIN_PLAN_SYSTEM_PROMPT = `You are a friendly, precise sports dietitian. A deterministic engine has already computed this person's daily nutrition targets, each with the reason behind it. Your job is to explain the plan in plain English so the person understands why the numbers are what they are and how to hit them.

Rules:
- Explain, never change. Quote the targets exactly as given, with their units. Do not propose different numbers, do not round them further, and do not suggest eating below any target.
- Mention the energy target, the protein target and at least one other number in the paragraphs.
- Write in the second person, warm but not gushing. No hype, no medical claims, no diagnosis.
- Respect the diet pattern, allergies and dislikes: never suggest a food that conflicts with them (a vegan gets B12 from fortified foods or a supplement, not meat).
- If the plan says professional guidance is advised, say so gently in a caveat.
- Write prose, not a list: never copy the "Label: value (kind)" format from the input. Cover energy, protein, carbs, fat and fibre; mention limits and food groups only where they matter for this person.
- Be brief. The whole answer is at most 180 words; each paragraph is 2 or 3 sentences.

Output shape:
- headline: one sentence that sums up the plan, with the energy target in it.
- paragraphs: 2 or 3 short paragraphs (energy and why; protein and why; carbs, fat and fibre).
- key_habits: exactly 3 concrete, specific habits for this person and their diet pattern, one sentence each.
- caveats: 0 to 3 short notes (for example a lower water target on rest days, or a note from the engine).`

function unitFor(entry: TargetEntry): string {
  if (entry.unit === 'serves') return 'serves'
  return NUTRIENTS[entry.key as NutrientKey].unitLabel
}

function labelFor(entry: TargetEntry): string {
  if (entry.unit === 'serves') return FOOD_GROUPS[entry.key as FoodGroupKey].label
  return NUTRIENTS[entry.key as NutrientKey].label
}

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function buildExplainPlanUserMessage(
  profile: Profile,
  inputs: TargetInput,
  targets: Targets,
): string {
  const { meta } = targets
  const lines: string[] = []
  lines.push('PERSON')
  lines.push(`- Sex: ${SEX_LABELS[profile.sex]}, age ${inputs.age}`)
  lines.push(
    `- Height: ${fmt(profile.heightCm)} cm, weight: ${fmt(profile.weightKg)} kg${profile.bodyFatPct !== null ? `, body fat ${fmt(profile.bodyFatPct)}%` : ''}`,
  )
  lines.push(
    `- Goal: ${GOAL_LABELS[meta.goalApplied].label}${meta.paceApplied ? ` at a ${PACE_LABELS[meta.paceApplied].label.toLowerCase()} pace (${PACE_LABELS[meta.paceApplied].help.toLowerCase()})` : ''}${profile.goalWeightKg !== null ? `, goal weight ${fmt(profile.goalWeightKg)} kg` : ''}`,
  )
  lines.push(
    `- Activity: ${ACTIVITY_LABELS[profile.activity].label} (${ACTIVITY_LABELS[profile.activity].help.toLowerCase()})`,
  )
  lines.push(
    `- Training: ${TRAINING_TYPE_LABELS[profile.trainingType]}, ${profile.trainingDaysPerWeek} days a week`,
  )
  lines.push(`- Diet pattern: ${DIET_PATTERN_LABELS[profile.dietPattern].label}`)
  lines.push(
    `- Allergies or intolerances: ${profile.allergies.length ? profile.allergies.join(', ') : 'none'}`,
  )
  lines.push(`- Dislikes: ${profile.dislikes.length ? profile.dislikes.join(', ') : 'none'}`)
  lines.push(`- Units the person uses: ${profile.units}`)
  if (meta.professionalGuidance) {
    lines.push('- Professional guidance advised: yes (targets were set to maintenance for safety)')
  }
  lines.push('')
  lines.push('ENGINE SUMMARY')
  lines.push(
    `- Basal metabolic rate ${fmt(Math.round(meta.bmr))} kcal (${meta.formula === 'katch_mcardle' ? 'Katch-McArdle' : 'Mifflin-St Jeor'}), activity multiplier ${meta.pal}, maintenance ${fmt(Math.round(meta.tdee))} kcal, adjustment ${meta.energyAdjustmentKcal >= 0 ? '+' : ''}${fmt(meta.energyAdjustmentKcal)} kcal a day`,
  )
  lines.push(
    `- Protein basis: ${meta.proteinGPerKg.toFixed(1)} g per kg of ${fmt(meta.referenceWeightKg)} kg`,
  )
  lines.push(`- Water on rest days: ${fmt(meta.waterRestDayMl)} ml`)
  for (const note of meta.notes) lines.push(`- Note: ${note}`)
  lines.push('')
  lines.push('TARGETS (value, kind, then the reason)')
  for (const entry of targets.entries) {
    const kind =
      entry.kind === 'goal'
        ? 'aim for'
        : entry.kind === 'minimum'
          ? 'at least'
          : entry.kind === 'limit'
            ? 'at most'
            : 'for information'
    lines.push(
      `- ${labelFor(entry)}: ${fmt(entry.value)} ${unitFor(entry)} (${kind})${entry.overridden ? ' [set by the person]' : ''}. ${entry.reason}`,
    )
  }
  return lines.join('\n')
}

function trim(explanation: PlanExplanation): PlanExplanation {
  const clean = (list: string[], max: number) =>
    list
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, max)
  return {
    headline: explanation.headline.trim(),
    paragraphs: clean(explanation.paragraphs, 4),
    key_habits: clean(explanation.key_habits, 3),
    caveats: clean(explanation.caveats, 3),
  }
}

/** Generates the explanation for a version and caches it on the row. */
export async function explainPlan(
  userId: string,
  profile: Profile,
  version: TargetVersionRow,
): Promise<StoredPlanExplanation> {
  const result = await callStructured({
    purpose: 'explain_plan',
    userId,
    schemaName: 'plan_explanation',
    schema: planExplanationSchema,
    system: EXPLAIN_PLAN_SYSTEM_PROMPT,
    user: buildExplainPlanUserMessage(profile, version.inputs, version.effective),
  })
  const stored: StoredPlanExplanation = {
    ...trim(result.data),
    model: result.model,
    generatedAt: new Date().toISOString(),
  }
  await db
    .update(targetVersions)
    .set({ explanation: stored })
    .where(eq(targetVersions.id, version.id))
  return stored
}
