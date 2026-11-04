import {
  COACH_BRIEF_MAX_CHARS,
  MEAL_LABELS,
  MEALS,
  bestSetBy,
  coachBriefSchema,
  liftMetric,
  primaryMeasure,
  coachBriefSentenceSchema,
  isWaterEntry,
  localDay,
  localTimeParts,
  type CoachBrief,
  type CoachBriefHalf,
  type Meal,
  type Profile,
  type TargetKey,
  type Workout,
  workoutSummary,
} from '@diet-tracker/shared'
import { and, asc, eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { db } from '../../db/client.js'
import { coachBriefs } from '../../db/schema/index.js'
import { env } from '../../env.js'
import { AppError } from '../../errors.js'
import { logger } from '../../logger.js'
import { callsToday } from '../estimate.js'
import { aiConfigured, callStructured } from '../openai.js'
import { coachModelName } from './agent.js'
import { biggestGainLine, loadBriefingInputs, measuresOf, type BriefingInputs } from './briefing.js'
import { dayLabel, keyLabel, keyUnit, setText, weekdayShort, whole } from './format.js'

/**
 * The daily brief (slice 11c): one line at the top of Today in each half. The facts and a
 * sentence are built in code from the same briefing inputs the coach reads; the model is
 * asked only to say the sentence better, from those facts and nothing else. A sentence
 * that brings a number the facts do not hold, or runs long, is dropped for the app's own.
 * Generated at most once a day per half when Today opens (D17's pattern) and cached on
 * the day; with nothing logged yet the line invites the first entry, costs no call and is
 * not cached, so it changes the moment something is logged.
 */

export interface BriefDraft {
  half: CoachBriefHalf
  day: string
  /** Labelled lines the model may draw numbers from. */
  facts: string[]
  /** The app's own sentence, shown when the model is not asked or not usable. */
  sentence: string
  /** Nothing to brief on yet: `sentence` is an invitation and the model is not asked. */
  empty: boolean
}

/** The main meals and the local hour after which each is no longer "to go". */
const MEAL_WINDOW_ENDS: Readonly<Record<Meal, number | null>> = {
  breakfast: 11,
  lunch: 15,
  dinner: 21,
  snack: null,
}

/** "1,900" as the Today tiles print it; the trace check strips the commas. */
function grouped(value: number): string {
  return whole(value).toLocaleString('en-GB')
}

function joinWords(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

export function draftBrief(inputs: BriefingInputs, half: CoachBriefHalf): BriefDraft {
  const today = localDay(inputs.now, inputs.profile.timezone)
  return half === 'diet' ? dietDraft(inputs, today) : trainingDraft(inputs, today)
}

function dietDraft(inputs: BriefingInputs, today: string): BriefDraft {
  const { profile, day, dayScore, targets, gym } = inputs
  const { hour } = localTimeParts(inputs.now, profile.timezone)
  // Planned food is not eaten (D43): a plan alone leaves the day empty and its meal to go.
  const foodEntries = day.entries.filter((e) => !isWaterEntry(e) && !e.planned)
  const facts: string[] = []
  facts.push(`- Today is ${dayLabel(today)}, local time ${String(hour).padStart(2, '0')}:00.`)

  if (foodEntries.length === 0) {
    const sentence =
      hour < 11
        ? "Nothing logged yet. Log breakfast and I'll tell you where you stand."
        : "Nothing logged yet today. Log what you've had and I'll tell you where you stand."
    return { half: 'diet', day: today, facts, sentence, empty: true }
  }

  const logged = MEALS.filter((meal) => foodEntries.some((e) => e.meal === meal))
  const toGo = MEALS.filter((meal) => {
    const end = MEAL_WINDOW_ENDS[meal]
    return end !== null && !logged.includes(meal) && hour < end
  })
  facts.push(
    `- Logged so far: ${foodEntries.length} item${foodEntries.length === 1 ? '' : 's'} across ${logged.map((m) => MEAL_LABELS[m].toLowerCase()).join(', ')}.`,
  )
  facts.push(
    `- Still to go today: ${toGo.length ? toGo.map((m) => MEAL_LABELS[m].toLowerCase()).join(', ') : 'no main meals'}.`,
  )

  const keys: TargetKey[] = ['energy_kcal', 'protein_g']
  const scores = keys.flatMap((key) => {
    const score = dayScore.scores[key]
    return score ? [{ key, score }] : []
  })
  for (const { key, score } of scores) {
    const left = Math.max(0, score.target - score.actual)
    const over = Math.max(0, score.actual - score.target)
    facts.push(
      `- ${keyLabel(key)}: ${grouped(score.actual)} of ${grouped(score.target)} ${keyUnit(key)} so far, ${score.status}${left > 0 ? `, ${grouped(left)} ${keyUnit(key)} left` : over > 0 ? `, ${grouped(over)} ${keyUnit(key)} over` : ''}${targets.entries.find((e) => e.key === key)?.uncapped ? ' (uncapped: over is fine)' : ''}.`,
    )
  }
  facts.push(`- Day so far: ${dayScore.dayMet ? 'met' : 'not met yet'}.`)
  if (gym) {
    const todays = gym.current.find((w) => w.day === today)
    facts.push(
      todays
        ? `- Training today: ${todays.title || 'a session'}${todays.endedAt ? ', finished' : ', under way'}.`
        : '- Training today: no session logged yet.',
    )
  }

  const toGoWords = toGo.length ? joinWords(toGo.map((m) => MEAL_LABELS[m].toLowerCase())) : null
  const energy = scores.find((s) => s.key === 'energy_kcal')?.score
  const protein = scores.find((s) => s.key === 'protein_g')?.score
  const short = scores
    .filter(({ score }) => score.status === 'short' || score.status === 'close')
    .sort((a, b) => (a.score.ratio ?? 0) - (b.score.ratio ?? 0))[0]
  let sentence: string
  if (short) {
    const left = short.score.target - short.score.actual
    sentence = `${keyLabel(short.key)} is ${grouped(left)} ${keyUnit(short.key)} short${toGoWords ? ` with ${toGoWords} to go` : ' with no main meals to go'}: ${grouped(short.score.actual)} of ${grouped(short.score.target)} ${keyUnit(short.key)} so far.`
  } else if (energy && protein) {
    sentence = `${dayScore.dayMet ? 'Day met so far' : 'Energy and protein are there'}: ${grouped(energy.actual)} of ${grouped(energy.target)} kcal and ${grouped(protein.actual)} of ${grouped(protein.target)} g protein${toGoWords ? `, with ${toGoWords} to go` : ''}.`
  } else {
    sentence = `${foodEntries.length} item${foodEntries.length === 1 ? '' : 's'} logged so far${toGoWords ? `, with ${toGoWords} to go` : ''}.`
  }
  return { half: 'diet', day: today, facts, sentence, empty: false }
}

/** The set the person would call the session's top lift: the best set of its first weight-and-reps exercise. */
function topLift(workout: Workout, inputs: BriefingInputs): string | null {
  if (!inputs.gym) return null
  for (const block of workout.exercises) {
    const measures = measuresOf(block.exerciseId, block.exerciseName, inputs.gym.exercises)
    const measure = primaryMeasure(measures)
    if (!measure) continue
    const metric = liftMetric(measure, inputs.profile.preferences.bestBy, measures.includes('reps'))
    const best = bestSetBy(block.sets, metric)
    if (best) return `${block.exerciseName.toLowerCase()} ${setText(best, measures)}`
  }
  return null
}

function trainingDraft(inputs: BriefingInputs, today: string): BriefDraft {
  const { profile, gym } = inputs
  const facts: string[] = [`- Today is ${dayLabel(today)}.`]
  const planned = profile.trainingDaysPerWeek
  const finished = gym ? gym.current.filter((w) => w.endedAt) : []
  const todays = gym ? (gym.current.find((w) => w.day === today) ?? null) : null
  const last =
    [...(gym?.current ?? []), ...(gym?.previous ?? [])]
      .filter((w) => w.endedAt && w.day !== today)
      .sort((a, b) => (a.day < b.day ? 1 : -1))[0] ?? null

  if (!gym || (finished.length === 0 && !todays && !last)) {
    return {
      half: 'training',
      day: today,
      facts,
      sentence: "No sessions in the last two weeks. Log one and I'll track your lifts here.",
      empty: true,
    }
  }

  const sessions = finished.length
  facts.push(`- This week: ${sessions} of ${planned} planned sessions done.`)
  if (todays) {
    const summary = summariseSession(todays)
    facts.push(
      `- Today: ${todays.title || 'Workout'}${todays.endedAt ? ' finished' : ' under way'}: ${summary.sets} sets, ${grouped(summary.volumeKg)} kg lifted${topLift(todays, inputs) ? `, top lift ${topLift(todays, inputs)}` : ''}.`,
    )
  } else {
    facts.push('- Today: no session logged yet.')
  }
  if (last) {
    const lift = topLift(last, inputs)
    facts.push(
      `- Last session: ${last.title || 'Workout'} on ${dayLabel(last.day)}${lift ? `, top lift ${lift}` : ''}.`,
    )
  }
  const gain = biggestGainLine(gym, profile)
  if (gain) facts.push(`- Week on week: ${gain}.`)

  let sentence: string
  const weekPart = `${sessions} of ${planned} sessions this week`
  if (todays) {
    const summary = summariseSession(todays)
    sentence = todays.endedAt
      ? `${todays.title || 'Workout'} done today: ${summary.sets} sets, ${grouped(summary.volumeKg)} kg lifted; ${weekPart}.`
      : `${todays.title || 'Workout'} is under way: ${summary.sets} sets so far; ${weekPart}.`
  } else if (last) {
    const lift = topLift(last, inputs)
    sentence = `${sessions === 0 ? `No session yet this week (${planned} planned)` : weekPart.charAt(0).toUpperCase() + weekPart.slice(1)}; last was ${last.title || 'Workout'} on ${weekdayShort(last.day)}${lift ? `: ${lift}` : ''}.`
  } else {
    sentence = `${weekPart.charAt(0).toUpperCase() + weekPart.slice(1)}.`
  }
  return { half: 'training', day: today, facts, sentence, empty: false }
}

function summariseSession(workout: Workout): { sets: number; volumeKg: number } {
  const summary = workoutSummary(workout)
  return { sets: summary.workingSets, volumeKg: summary.volumeKg }
}

/** Every brief the model wrote for the person, oldest first, for the export (D24). */
export async function allBriefs(userId: string): Promise<CoachBrief[]> {
  const rows = await db
    .select()
    .from(coachBriefs)
    .where(eq(coachBriefs.userId, userId))
    .orderBy(asc(coachBriefs.day), asc(coachBriefs.half))
  return rows.map((row) =>
    coachBriefSchema.parse({
      half: row.half,
      day: row.day,
      text: row.text,
      model: row.model,
      generatedAt: row.generatedAt.toISOString(),
      empty: false,
    }),
  )
}

// --- The sentence from the model ------------------------------------------------------------

export const BRIEF_SYSTEM_PROMPT = `You write the one-line brief at the top of a person's Today screen in a nutrition and gym app. The app has already worked out the facts below; your only job is to say them well.

Rules:
- One sentence, under 120 characters, plain words, second person or no person. No greeting, no name, no emoji, no exclamation marks.
- Use only numbers that appear in the facts, copied exactly with their units. Never add a number, a food, an exercise or a day.
- The day is in progress: say where things stand and what is left, never whether it was good or bad. No advice, no praise, no warnings.
- Lead with the thing that matters most: what is short and what is still to go, or the session done and the week's count.
- In the gym, keep the last session's top lift (exercise, weight and reps) when the facts name one.`

export interface BriefWriter {
  write(args: { userId: string; user: string }): Promise<{ sentence: string; model: string } | null>
}

/** Set by tests; null means the real model through `callStructured`. */
export const briefModel: { override: BriefWriter | null } = { override: null }

const realWriter: BriefWriter = {
  async write({ userId, user }) {
    try {
      const result = await callStructured({
        purpose: 'brief',
        userId,
        schemaName: 'daily_brief',
        schema: coachBriefSentenceSchema,
        system: BRIEF_SYSTEM_PROMPT,
        user,
        model: coachModelName(),
        maxOutputTokens: 300,
      })
      return { sentence: result.data.sentence, model: result.model }
    } catch (error) {
      // The app's own sentence stands in; the failure is already in `ai_calls`.
      if (!(error instanceof AppError)) logger.warn({ err: error }, 'brief call failed')
      return null
    }
  },
}

export function numbersIn(text: string): string[] {
  return [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0].replace(/,/g, ''))
}

/** The model's sentence is used only when every number in it is one of the facts' and it fits a line. */
export function acceptableSentence(sentence: string, facts: readonly string[]): string | null {
  const clean = sentence.replace(/\s+/g, ' ').trim()
  if (!clean || clean.length > COACH_BRIEF_MAX_CHARS) return null
  const allowed = new Set(numbersIn(facts.join('\n')))
  for (const number of numbersIn(clean)) if (!allowed.has(number)) return null
  return clean
}

export function briefUserMessage(draft: BriefDraft): string {
  return [
    `FACTS (${draft.half === 'diet' ? 'food' : 'gym'})`,
    ...draft.facts,
    '',
    `The app's own sentence, for reference: "${draft.sentence}"`,
  ].join('\n')
}

/**
 * Today's brief for one half: the cached line when the model wrote one today, otherwise
 * the draft, polished by the model when there is a key and the daily cap allows, and
 * stored only when the model's sentence passed the checks.
 */
export async function getBrief(
  userId: string,
  profile: Profile,
  half: CoachBriefHalf,
  now: Date = new Date(),
): Promise<CoachBrief> {
  const today = localDay(now, profile.timezone)
  const cached = (
    await db
      .select()
      .from(coachBriefs)
      .where(
        and(eq(coachBriefs.userId, userId), eq(coachBriefs.half, half), eq(coachBriefs.day, today)),
      )
      .limit(1)
  )[0]
  if (cached) {
    return coachBriefSchema.parse({
      half,
      day: today,
      text: cached.text,
      model: cached.model,
      generatedAt: cached.generatedAt.toISOString(),
      empty: false,
    })
  }

  const draft = draftBrief(await loadBriefingInputs(userId, profile, now), half)
  const own = (): CoachBrief =>
    coachBriefSchema.parse({
      half,
      day: today,
      text: draft.sentence,
      model: null,
      generatedAt: now.toISOString(),
      empty: draft.empty,
    })
  if (draft.empty || !aiConfigured()) return own()
  if ((await callsToday(userId, profile.timezone, now)) >= env.AI_DAILY_CALL_CAP) return own()

  const written = await (briefModel.override ?? realWriter).write({
    userId,
    user: briefUserMessage(draft),
  })
  const text = written ? acceptableSentence(written.sentence, draft.facts) : null
  if (!written || !text) return own()

  await db
    .insert(coachBriefs)
    .values({
      id: uuidv7(),
      userId,
      half,
      day: today,
      text,
      model: written.model,
      generatedAt: now,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [coachBriefs.userId, coachBriefs.half, coachBriefs.day],
      set: { text, model: written.model, generatedAt: now },
    })
  return coachBriefSchema.parse({
    half,
    day: today,
    text,
    model: written.model,
    generatedAt: now.toISOString(),
    empty: false,
  })
}
