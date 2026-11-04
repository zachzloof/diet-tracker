import {
  ACTIVITY_LABELS,
  DIET_PATTERN_LABELS,
  GOAL_LABELS,
  MEAL_LABELS,
  MEALS,
  PACE_LABELS,
  TRAINING_TYPE_LABELS,
  WEIGHT_HISTORY_DAYS,
  addDays,
  ageOn,
  biggestDrop,
  biggestGain,
  compareWeeks,
  dayMetRule,
  energyUncapped,
  evaluateDay,
  isWaterEntry,
  localDay,
  localTimeParts,
  primaryMeasure,
  shownTargetKeys,
  summariseTarget,
  summariseWorkouts,
  weightRate,
  weightTrend,
  workoutSummary,
  type CoachNote,
  type DayLogResponse,
  type DayScore,
  type Exercise,
  type ExerciseMeasure,
  type LiftChange,
  type Preferences,
  type Profile,
  type RecalibrationAssessment,
  type ScoredDay,
  type TargetKey,
  type Targets,
  type WeekStatsResponse,
  type WeightsResponse,
  type Workout,
} from '@diet-tracker/shared'
import { getDay } from '../../log/log-service.js'
import { requireLatestVersion } from '../../profile/targets-service.js'
import { assess } from '../../progress/recalibration-service.js'
import { listWeights } from '../../progress/weight-service.js'
import { weekStats } from '../../stats/stats-service.js'
import { listExercises } from '../../training/exercises-service.js'
import { listWorkouts } from '../../training/workouts-service.js'
import { allNotes } from './notes-service.js'
import {
  dayLabel,
  fmt,
  keyLabel,
  keyUnit,
  metricValueText,
  minutesBetween,
  pct,
  setText,
  weekdayLong,
  weekdayShort,
  whole,
} from './format.js'

/**
 * The pre-brief (ai-coach skill): everything the app knows about the person's day, week,
 * targets, gym, weight and plan check, as labelled lines under the system prompt. Built in
 * code every turn from the same services the screens read, rounded as the screens round,
 * so the coach quotes what the person sees. `buildBriefing` is pure given its inputs.
 *
 * Since slice 11c the sections are exported one by one: the weekly review is written from
 * the same PERSON, TARGETS and THIS WEEK lines (`weekly-review.ts`), and the daily brief
 * (`brief.ts`) reads the same inputs, so the three never disagree on a number.
 */

export interface BriefingInputs {
  now: Date
  profile: Profile
  /** The effective targets of the current version. */
  targets: Targets
  /** Today's log and its score against `targets`. */
  day: DayLogResponse
  dayScore: DayScore
  week: WeekStatsResponse
  /** Null when workouts are switched off in Preferences (D37). */
  gym: { current: Workout[]; previous: Workout[]; exercises: Exercise[] } | null
  weights: WeightsResponse
  recalibration: RecalibrationAssessment
  /** Lines the person asked the coach to remember (slice 11b), oldest first. */
  notes: CoachNote[]
}

/** The weight window the briefing summarises. */
export const BRIEFING_WEIGHT_DAYS = 28

const TODAY_KEYS: readonly TargetKey[] = [
  'energy_kcal',
  'protein_g',
  'carbs_g',
  'fat_g',
  'fiber_g',
  'water_ml',
]
/** The per-day numbers in the full week lines (the review's), as the Week rows list them. */
const DAY_LINE_KEYS: readonly TargetKey[] = [
  'energy_kcal',
  'protein_g',
  'carbs_g',
  'fat_g',
  'fiber_g',
  'sodium_mg',
  'water_ml',
]
const WEEK_KEYS: readonly TargetKey[] = [
  ...TODAY_KEYS,
  'sodium_mg',
  'saturated_fat_g',
  'added_sugar_g',
  'vegetables',
  'fruit',
  'whole_grains',
  'protein_foods',
  'dairy_or_alt',
]
const TARGET_KEYS: readonly TargetKey[] = [
  'energy_kcal',
  'protein_g',
  'carbs_g',
  'fat_g',
  'fiber_g',
  'water_ml',
  'sodium_mg',
  'saturated_fat_g',
  'added_sugar_g',
]

const MAX_PLANNED_NAMES = 6

function list(items: readonly string[]): string {
  return items.length ? items.join(', ') : 'none'
}

/** Serves keep one decimal (2.5 of 6), as the gap evidence does; nutrient units are whole. */
function amount(value: number, key: TargetKey): string {
  return keyUnit(key) === 'serves' ? fmt(value) : String(whole(value))
}

/** The goal's "day met" rule in words, so neither the coach nor the review cites a limit the rule ignores. */
export function dayMetSentence(targets: Targets): string {
  const uncapped = energyUncapped(targets)
  const rule = dayMetRule(targets.meta.goalApplied, uncapped)
  const energy = uncapped
    ? 'energy is at least 90% of target (the energy target is uncapped: eating over it is fine and never a problem to raise)'
    : 'energy is within 10% of target'
  const protein = rule.proteinCloseOk
    ? 'protein is at least 75% of target'
    : 'protein is at least 90% of target'
  const limits =
    rule.decidingLimits.length === 0
      ? 'no limit affects whether the day is met for this goal'
      : `${rule.decidingLimits.map((k) => keyLabel(k).toLowerCase()).join(', ')} ${rule.decidingLimits.length === 1 ? 'is' : 'are'} not more than 5% over the limit`
  return `A day is met (for the goal "${GOAL_LABELS[rule.goal].label.toLowerCase()}") when ${energy}, ${protein} and ${limits}.`
}

export function personLines(profile: Profile, today: string): string[] {
  const prefs = profile.preferences
  const lines: string[] = ['PERSON']
  const sex = profile.sex === 'male' ? 'Male' : profile.sex === 'female' ? 'Female' : 'Adult'
  const pace = profile.pace ? `, ${PACE_LABELS[profile.pace].label.toLowerCase()} pace` : ''
  lines.push(
    `- ${sex}, ${ageOn(profile.dob, today)}, ${fmt(profile.heightCm)} cm, ${fmt(profile.weightKg)} kg. Goal: ${GOAL_LABELS[profile.goal].label.toLowerCase()}${pace}${profile.goalWeightKg ? `, goal weight ${fmt(profile.goalWeightKg)} kg` : ''}.`,
  )
  lines.push(
    `- Activity: ${ACTIVITY_LABELS[profile.activity].label.toLowerCase()}. Training: ${TRAINING_TYPE_LABELS[profile.trainingType].toLowerCase()}, ${profile.trainingDaysPerWeek} days a week planned.`,
  )
  lines.push(
    `- Diet pattern: ${DIET_PATTERN_LABELS[profile.dietPattern].label}. Allergies or intolerances: ${list(profile.allergies)}. Dislikes: ${list(profile.dislikes)}.`,
  )
  const hidden = [
    ...(prefs.water ? [] : ['water tracking']),
    ...(prefs.workouts ? [] : ['the gym']),
    ...(prefs.nutrientDetail === 'macros' ? ['everything beyond the macros'] : []),
  ]
  if (hidden.length) lines.push(`- Switched off in Preferences: ${hidden.join(', ')}.`)
  return lines
}

export function targetLines(targets: Targets, prefs: Preferences): string[] {
  const lines: string[] = [
    'TARGETS (the engine sets these; "pinned" means the person set that number)',
  ]
  for (const key of shownTargetKeys(TARGET_KEYS, prefs)) {
    const entry = targets.entries.find((e) => e.key === key)
    if (!entry) continue
    const flags = [
      ...(entry.overridden ? ['pinned'] : []),
      ...(entry.uncapped ? ['uncapped: a floor, over is fine'] : []),
      ...(entry.floor !== null ? [`floor ${fmt(entry.floor)} ${keyUnit(key)}`] : []),
    ]
    lines.push(
      `- ${keyLabel(key)}: ${fmt(entry.value)} ${keyUnit(key)}${flags.length ? ` (${flags.join('; ')})` : ''}. ${entry.reason}`,
    )
  }
  lines.push(`- ${dayMetSentence(targets)}`)
  return lines
}

/** What is planned and not eaten yet (D43); it is in none of the day's numbers. */
function plannedLine(day: DayLogResponse): string | null {
  const planned = day.entries.filter((e) => e.planned)
  if (planned.length === 0) return null
  const names = planned.slice(0, MAX_PLANNED_NAMES).map((e) => e.groupName ?? e.name)
  const kcal = planned.reduce((sum, e) => sum + e.nutrients.energy_kcal, 0)
  return `- Planned for later, not eaten and in none of these numbers: ${list([...new Set(names)])} (${whole(kcal)} kcal).`
}

export function todayLines(day: DayLogResponse, dayScore: DayScore, prefs: Preferences): string[] {
  const lines: string[] = ['TODAY SO FAR']
  const foodEntries = day.entries.filter((e) => !isWaterEntry(e) && !e.planned)
  const planned = plannedLine(day)
  if (foodEntries.length === 0) {
    lines.push('- Nothing logged yet today.')
    if (planned) lines.push(planned)
    return lines
  }
  const meals = MEALS.filter((meal) => foodEntries.some((e) => e.meal === meal)).map((meal) =>
    MEAL_LABELS[meal].toLowerCase(),
  )
  lines.push(
    `- ${foodEntries.length} item${foodEntries.length === 1 ? '' : 's'} logged across ${list(meals)}.`,
  )
  for (const key of shownTargetKeys(TODAY_KEYS, prefs)) {
    const score = dayScore.scores[key]
    if (!score) continue
    // What is left (or over) is spelled out so the coach quotes it rather than subtracting.
    const left = whole(Math.max(0, score.target - score.actual))
    const over = whole(Math.max(0, score.actual - score.target))
    const rest =
      score.kind === 'limit'
        ? over > 0
          ? `, ${over} ${keyUnit(key)} over the limit`
          : `, ${left} ${keyUnit(key)} under the limit`
        : left > 0
          ? `, ${left} ${keyUnit(key)} left`
          : over > 0
            ? `, ${over} ${keyUnit(key)} over`
            : ''
    lines.push(
      `- ${keyLabel(key)}: ${whole(score.actual)} / ${whole(score.target)} ${keyUnit(key)}${pct(score.ratio)}, ${score.status}${score.kind === 'limit' ? ' (limit)' : ''}${rest}.`,
    )
  }
  lines.push(`- Day so far: ${dayScore.dayMet ? 'met' : 'not met yet'}.`)
  if (planned) lines.push(planned)
  return lines
}

/** One day of the week. `full` adds every Week-row number and what went wrong; `compact` is the coach's. */
function dayLine(scored: ScoredDay, today: string, prefs: Preferences, detail: WeekDetail): string {
  const { day, score } = scored
  const energy = score.scores.energy_kcal
  const label = `${weekdayShort(day)} ${day}`
  if (day === today)
    return `- ${label}: today, in progress (${whole(energy?.actual ?? 0)} kcal so far).`
  if (!score.logged) return `- ${label}: nothing logged.`
  const verdict = score.dayMet ? 'met' : 'not met'
  if (detail === 'compact') {
    const protein = score.scores.protein_g
    return `- ${label}: ${whole(energy?.actual ?? 0)} kcal, ${whole(protein?.actual ?? 0)} g protein, ${verdict}.`
  }
  const parts = shownTargetKeys(DAY_LINE_KEYS, prefs).flatMap((key) => {
    const s = score.scores[key]
    if (!s) return []
    return [
      `${keyLabel(key).toLowerCase()} ${whole(s.actual)} / ${whole(s.target)} ${keyUnit(key)}`,
    ]
  })
  const problems = Object.values(score.scores)
    .filter((s) => s.status === 'short' || s.status === 'over')
    .filter((s) => s.kind === 'goal' || s.kind === 'limit')
    .map((s) => `${keyLabel(s.key).toLowerCase()} ${s.status}`)
  return `- ${label}: ${parts.join(', ')}: ${verdict}${!score.dayMet && problems.length ? ` (${problems.join(', ')})` : ''}.`
}

export type WeekDetail = 'compact' | 'full'

/**
 * THIS WEEK: the seven days, the averages over logged days and the ranked gaps, exactly as
 * the Week screen shows them. The coach reads it compact on every turn; the weekly review
 * reads it in full, so the two quote the same numbers and the same verdicts.
 */
export function weekLines(
  week: WeekStatsResponse,
  today: string,
  prefs: Preferences,
  detail: WeekDetail = 'compact',
): string[] {
  const lines: string[] = []
  lines.push(
    `THIS WEEK (${dayLabel(week.start)} to ${dayLabel(week.end)}${week.end === today ? ', today included' : ''}; today is ${dayLabel(today)})`,
  )
  lines.push(
    `- Days logged: ${week.daysLogged} of 7. Days met: ${week.daysMet}. Streak: ${week.streak} day${week.streak === 1 ? '' : 's'}.`,
  )
  for (const scored of week.days) lines.push(dayLine(scored, today, prefs, detail))
  lines.push('- Averages over logged days (actual / target, met on N days):')
  for (const key of shownTargetKeys(WEEK_KEYS, prefs)) {
    const summary = summariseTarget(week.days, key)
    if (summary.average === null || summary.target === null) continue
    lines.push(
      `  - ${keyLabel(key)}: ${amount(summary.average, key)} / ${amount(summary.target, key)} ${keyUnit(key)}${pct(summary.averageRatio)}, met on ${summary.daysMet} of ${summary.daysLogged}.`,
    )
  }
  if (week.gaps.length === 0) {
    lines.push('- Gaps: none. Every rule passed this week.')
  } else {
    lines.push('- Gaps, ranked as the Week screen lists them:')
    week.gaps.forEach((gap, i) => {
      lines.push(`  ${i + 1}. [${gap.severity}] ${gap.title}: ${gap.evidence}`)
      if (gap.suggestions.length) lines.push(`     Fits this person: ${gap.suggestions.join('; ')}`)
    })
  }
  return lines
}

export function planCheckLines(recalibration: RecalibrationAssessment): string[] {
  const lines: string[] = [
    'PLAN CHECK (recalibration, every 14 days from logged days and weigh-ins)',
  ]
  lines.push(`- Status: ${recalibration.status.replace(/_/g, ' ')}. ${recalibration.reason}`)
  if (recalibration.proposal) {
    const p = recalibration.proposal
    lines.push(
      `- Proposal waiting on the Today screen: energy ${fmt(p.current.energyKcal)} → ${fmt(p.proposed.energyKcal)} kcal (${p.deltaKcal > 0 ? '+' : ''}${fmt(p.deltaKcal)}), protein ${fmt(p.proposed.proteinG)} g, carbs ${fmt(p.proposed.carbsG)} g, fat ${fmt(p.proposed.fatG)} g. The person applies or snoozes it; you do not.`,
    )
  }
  return lines
}

export function notesLines(notes: readonly CoachNote[], timeZone: string): string[] {
  const lines: string[] = [
    'NOTES (things the person asked you to remember; they manage them under Coach > Notes)',
  ]
  if (notes.length === 0) {
    lines.push('- None yet.')
  } else {
    for (const note of notes) {
      const day = localDay(new Date(note.createdAt), timeZone)
      lines.push(`- ${dayLabel(day)} ${day}: ${note.text}`)
    }
  }
  return lines
}

export function buildBriefing(inputs: BriefingInputs): string {
  const { profile, targets, day, dayScore, week, gym, weights, recalibration, notes } = inputs
  const today = localDay(inputs.now, profile.timezone)
  const time = localTimeParts(inputs.now, profile.timezone)
  const prefs = profile.preferences
  const lines: string[] = []

  lines.push('BRIEFING (built by the app just now; every number is the one on screen)')
  lines.push(
    `- Today is ${weekdayLong(today)} ${today}, ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')} in ${profile.timezone}. Yesterday was ${addDays(today, -1)}.`,
  )
  lines.push(
    `- Last seven days: ${Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))
      .map((d) => `${weekdayShort(d)} ${d}`)
      .join(', ')}.`,
  )
  lines.push('')
  lines.push(...personLines(profile, today), '')
  lines.push(...targetLines(targets, prefs), '')
  lines.push(...todayLines(day, dayScore, prefs), '')
  lines.push(...weekLines(week, today, prefs, 'compact'), '')
  if (gym) lines.push(...gymLines(gym, today, profile), '')
  lines.push(...weightLines(weights, today), '')
  lines.push(...planCheckLines(recalibration), '')
  lines.push(...notesLines(notes, profile.timezone))
  return lines.join('\n')
}

function liftLine(lift: LiftChange, exercises: readonly Exercise[]): string {
  const measures = measuresOf(lift.exerciseId, lift.exerciseName, exercises)
  const sign = lift.delta > 0 ? '+' : ''
  return `${lift.exerciseName}: ${metricValueText(lift.current.value, lift.metric)} (${setText(lift.current.best, measures)}), from ${metricValueText(lift.previous.value, lift.metric)} (${setText(lift.previous.best, measures)}) last week, ${sign}${fmt(lift.delta)}${lift.deltaPct !== null ? ` (${sign}${Math.round(lift.deltaPct * 100)}%)` : ''}`
}

export function measuresOf(
  exerciseId: string | null,
  exerciseName: string,
  exercises: readonly Exercise[],
): readonly ExerciseMeasure[] {
  const found =
    (exerciseId ? exercises.find((e) => e.id === exerciseId) : undefined) ??
    exercises.find((e) => e.name.toLowerCase() === exerciseName.toLowerCase())
  return found?.measures ?? ['weight', 'reps']
}

/** The week-on-week comparison the gym Week card draws, on the person's "best" basis. */
export function gymComparison(gym: NonNullable<BriefingInputs['gym']>, profile: Profile) {
  const measureOf = (exerciseId: string | null, exerciseName: string) => {
    const found = exerciseId ? gym.exercises.find((e) => e.id === exerciseId) : undefined
    const byName = found ?? gym.exercises.find((e) => e.name === exerciseName)
    return byName ? primaryMeasure(byName.measures) : null
  }
  return compareWeeks(gym.current, gym.previous, {
    measureOf,
    basis: profile.preferences.bestBy,
  })
}

/** The gym Week card's "biggest gain" as one line, or null with nothing to compare. */
export function biggestGainLine(
  gym: NonNullable<BriefingInputs['gym']>,
  profile: Profile,
): string | null {
  const comparison = gymComparison(gym, profile)
  if (comparison.previous.sessions === 0) return null
  const gain = biggestGain(comparison)
  return gain ? liftLine(gain, gym.exercises) : null
}

export function gymLines(
  gym: NonNullable<BriefingInputs['gym']>,
  today: string,
  profile: Profile,
): string[] {
  const lines: string[] = []
  const totals = summariseWorkouts(gym.current)
  const start = addDays(today, -6)
  lines.push(`GYM THIS WEEK (${dayLabel(start)} to ${dayLabel(today)})`)
  lines.push(
    `- Sessions: ${totals.sessions} of ${profile.trainingDaysPerWeek} planned. Working sets: ${totals.workingSets}. Lifted: ${whole(totals.volumeKg)} kg. Time: ${totals.minutes} min. Trained on: ${list(
      [...new Set(gym.current.filter((w) => w.endedAt).map((w) => w.day))]
        .sort()
        .map((d) => weekdayShort(d)),
    )}.`,
  )
  if (totals.sessions === 0 && gym.current.length === 0) {
    lines.push('- No sessions logged this week.')
  }
  for (const workout of [...gym.current].sort((a, b) => (a.day < b.day ? -1 : 1))) {
    const summary = workoutSummary(workout)
    const names = workout.exercises.map((block) => block.exerciseName)
    lines.push(
      `- ${weekdayShort(workout.day)} ${workout.day}: ${workout.title || 'Workout'}${workout.endedAt ? '' : ' (still open)'}: ${list(names)}; ${summary.workingSets} working sets, ${whole(summary.volumeKg)} kg${summary.durationMin !== null ? `, ${summary.durationMin} min` : ''}.`,
    )
  }
  const comparison = gymComparison(gym, profile)
  const gain = biggestGain(comparison)
  const drop = biggestDrop(comparison)
  if (comparison.previous.sessions === 0) {
    lines.push('- Week on week: no finished sessions the week before, so nothing to compare.')
  } else {
    lines.push(
      `- Week on week: lifted ${whole(comparison.current.volumeKg)} kg vs ${whole(comparison.previous.volumeKg)} kg${comparison.volumeChangePct !== null ? ` (${comparison.volumeChangePct > 0 ? '+' : ''}${Math.round(comparison.volumeChangePct * 100)}%)` : ''}; ${comparison.current.sessions} vs ${comparison.previous.sessions} sessions. "Best" means ${profile.preferences.bestBy === 'volume' ? 'kg lifted in one set (weight × reps)' : 'the heaviest weight'}.`,
    )
    if (gain) lines.push(`- Biggest gain: ${liftLine(gain, gym.exercises)}.`)
    if (drop) lines.push(`- Biggest drop: ${liftLine(drop, gym.exercises)}.`)
  }
  const todays = gym.current.filter((w) => w.day === today)
  if (todays.length === 0) {
    lines.push('- Today: no session logged yet.')
  } else {
    for (const workout of todays) {
      const summary = workoutSummary(workout)
      lines.push(
        `- Today's session: ${workout.title || 'Workout'}, ${workout.endedAt ? `finished, ${minutesBetween(workout.startedAt, workout.endedAt) ?? 0} min` : 'still open'}: ${list(
          workout.exercises.map((block) => block.exerciseName),
        )}; ${summary.workingSets} working sets, ${whole(summary.volumeKg)} kg.`,
      )
    }
  }
  return lines
}

export function weightLines(weights: WeightsResponse, today: string): string[] {
  const lines: string[] = []
  const start = addDays(today, -(BRIEFING_WEIGHT_DAYS - 1))
  lines.push(`WEIGHT (last ${BRIEFING_WEIGHT_DAYS} days, ${dayLabel(start)} to ${dayLabel(today)})`)
  if (weights.entries.length === 0) {
    lines.push('- No weigh-ins in the window.')
    return lines
  }
  const latest = weights.entries[weights.entries.length - 1]!
  const trend = weightTrend(weights.entries)
  const rate = weightRate(trend)
  const first = trend[0]!
  const last = trend[trend.length - 1]!
  lines.push(
    `- Latest: ${fmt(latest.weightKg)} kg on ${weekdayShort(latest.day)} ${latest.day}. ${weights.entries.length} weigh-in${weights.entries.length === 1 ? '' : 's'} in the window.`,
  )
  lines.push(
    `- Seven-day trend: ${fmt(last.trendKg)} kg now, ${fmt(first.trendKg)} kg on ${first.day} (${last.trendKg - first.trendKg >= 0 ? '+' : ''}${fmt(last.trendKg - first.trendKg)} kg).${rate ? ` Rate: ${rate.kgPerWeek > 0 ? '+' : ''}${fmt(rate.kgPerWeek)} kg a week over ${rate.spanDays} days.` : ' Too few days between weigh-ins for a rate yet.'}`,
  )
  lines.push(
    `- The plan expects ${weights.expectedKgPerWeek === 0 ? 'no change' : `${weights.expectedKgPerWeek > 0 ? '+' : ''}${fmt(weights.expectedKgPerWeek)} kg a week`}${weights.goalWeightKg ? `; goal weight ${fmt(weights.goalWeightKg)} kg` : ''}.`,
  )
  return lines
}

/** Gathers the briefing's inputs from the services the screens use, in one batch. */
export async function loadBriefingInputs(
  userId: string,
  profile: Profile,
  now: Date = new Date(),
): Promise<BriefingInputs> {
  const today = localDay(now, profile.timezone)
  const weekStart = addDays(today, -6)
  const previousStart = addDays(today, -13)
  const [version, day, week, workouts, exercises, weights, recalibration, notes] =
    await Promise.all([
      requireLatestVersion(userId),
      getDay(userId, today),
      weekStats(userId, profile, undefined, now),
      profile.preferences.workouts
        ? listWorkouts(userId, { from: previousStart, to: today })
        : Promise.resolve<Workout[]>([]),
      profile.preferences.workouts ? listExercises(userId) : Promise.resolve<Exercise[]>([]),
      listWeights(
        userId,
        profile,
        { days: Math.max(WEIGHT_HISTORY_DAYS.min, BRIEFING_WEIGHT_DAYS) },
        now,
      ),
      assess(userId, profile, now),
      allNotes(userId),
    ])
  const targets = version.effective
  return {
    now,
    profile,
    targets,
    day,
    dayScore: evaluateDay(
      {
        totals: day.summary.totals,
        foodGroups: day.summary.foodGroups,
        entryCount: day.summary.entryCount,
      },
      targets,
    ),
    week,
    gym: profile.preferences.workouts
      ? {
          current: workouts.filter((w) => w.day >= weekStart),
          previous: workouts.filter((w) => w.day < weekStart),
          exercises,
        }
      : null,
    weights,
    recalibration: recalibration.assessment,
    notes,
  }
}
