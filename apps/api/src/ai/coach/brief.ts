import {
  MEAL_LABELS,
  MEALS,
  bestSetBy,
  coachBriefSchema,
  liftMetric,
  primaryMeasure,
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
import { asc, eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { coachBriefs } from '../../db/schema/index.js'
import { loadBriefingInputs, measuresOf, type BriefingInputs } from './briefing.js'
import { keyLabel, keyUnit, setText, weekdayShort, whole } from './format.js'

/**
 * The daily brief (slice 11c): one line at the top of Today in each half, in the app's own
 * words. It is built in code on every request from the same briefing inputs the coach
 * reads, so it always matches the tiles under it and costs nothing. Until 2026-11-05 the
 * model rephrased the line once a day and the result was cached in `coach_briefs`; a line
 * written after breakfast then stayed on screen all day with the morning's numbers, so
 * the model and the cache were dropped (D41, amended). With nothing logged yet the line
 * invites the first entry.
 */

export interface BriefDraft {
  half: CoachBriefHalf
  day: string
  /** The line shown on Today. */
  sentence: string
  /** Nothing to brief on yet: `sentence` is an invitation. */
  empty: boolean
}

/** The main meals and the local hour after which each is no longer "to go". */
const MEAL_WINDOW_ENDS: Readonly<Record<Meal, number | null>> = {
  breakfast: 11,
  lunch: 15,
  dinner: 21,
  snack: null,
}

/** "1,900" as the Today tiles print it. */
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
  const { profile, day, dayScore } = inputs
  const { hour } = localTimeParts(inputs.now, profile.timezone)
  // Planned food is not eaten (D43): a plan alone leaves the day empty and its meal to go.
  const foodEntries = day.entries.filter((e) => !isWaterEntry(e) && !e.planned)

  if (foodEntries.length === 0) {
    const sentence =
      hour < 11
        ? "Nothing logged yet. Log breakfast and I'll tell you where you stand."
        : "Nothing logged yet today. Log what you've had and I'll tell you where you stand."
    return { half: 'diet', day: today, sentence, empty: true }
  }

  const logged = MEALS.filter((meal) => foodEntries.some((e) => e.meal === meal))
  const toGo = MEALS.filter((meal) => {
    const end = MEAL_WINDOW_ENDS[meal]
    return end !== null && !logged.includes(meal) && hour < end
  })
  const keys: TargetKey[] = ['energy_kcal', 'protein_g']
  const scores = keys.flatMap((key) => {
    const score = dayScore.scores[key]
    return score ? [{ key, score }] : []
  })

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
  return { half: 'diet', day: today, sentence, empty: false }
}

/** The set the person would call the session's top lift: the best set of its first weight-and-reps exercise. */
function topLift(workout: Workout, inputs: BriefingInputs): string | null {
  if (!inputs.gym) return null
  for (const block of workout.exercises) {
    const measures = measuresOf(block.exerciseId, block.exerciseName, inputs.gym.exercises)
    const measure = primaryMeasure(measures)
    if (!measure) continue
    const metric = liftMetric(measure, inputs.profile.preferences.bestBy, measures.includes('reps'))
    const best = bestSetBy(block.sets, metric, block.bodyweightKg)
    if (best) return `${block.exerciseName.toLowerCase()} ${setText(best, measures)}`
  }
  return null
}

function trainingDraft(inputs: BriefingInputs, today: string): BriefDraft {
  const { profile, gym } = inputs
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
      sentence: "No sessions in the last two weeks. Log one and I'll track your lifts here.",
      empty: true,
    }
  }

  const sessions = finished.length
  let sentence: string
  const weekPart = `${sessions} of ${planned} sessions this week`
  if (todays) {
    const summary = workoutSummary(todays)
    sentence = todays.endedAt
      ? `${todays.title || 'Workout'} done today: ${summary.workingSets} sets, ${grouped(summary.volumeKg)} kg lifted; ${weekPart}.`
      : `${todays.title || 'Workout'} is under way: ${summary.workingSets} sets so far; ${weekPart}.`
  } else if (last) {
    const lift = topLift(last, inputs)
    sentence = `${sessions === 0 ? `No session yet this week (${planned} planned)` : weekPart.charAt(0).toUpperCase() + weekPart.slice(1)}; last was ${last.title || 'Workout'} on ${weekdayShort(last.day)}${lift ? `: ${lift}` : ''}.`
  } else {
    sentence = `${weekPart.charAt(0).toUpperCase() + weekPart.slice(1)}.`
  }
  return { half: 'training', day: today, sentence, empty: false }
}

/**
 * The briefs the model wrote while it still wrote them (2026-11-02 to 2026-11-05), oldest
 * first, for the export (D24). Nothing adds to `coach_briefs` any more; the rows age out
 * under retention.
 */
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

/** Today's brief for one half, built from the person's numbers as they are right now. */
export async function getBrief(
  userId: string,
  profile: Profile,
  half: CoachBriefHalf,
  now: Date = new Date(),
): Promise<CoachBrief> {
  const draft = draftBrief(await loadBriefingInputs(userId, profile, now), half)
  return coachBriefSchema.parse({
    half,
    day: draft.day,
    text: draft.sentence,
    model: null,
    generatedAt: now.toISOString(),
    empty: draft.empty,
  })
}
