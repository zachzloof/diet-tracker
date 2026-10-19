import {
  DEFAULT_MEASURES,
  setMetricValue,
  tonnageParts,
  workoutSummary,
  type Exercise,
  type ExerciseMeasure,
  type SetMetric,
  type Workout,
  type WorkoutExerciseInput,
  type WorkoutInput,
  type WorkoutSet,
} from '@diet-tracker/shared'
import { formatNumber } from '@/lib/format'
import type { WorkoutDraft } from '@/stores/workout-draft'

/** Pure helpers for the session screen and the cards; the maths lives in `@diet-tracker/shared`. */

/**
 * What a block's set rows show: the exercise's measures when it is known; otherwise (a custom
 * exercise since deleted) whatever its sets already record, else weight and reps.
 */
export function blockMeasures(
  block: Pick<WorkoutExerciseInput, 'exerciseId' | 'sets'>,
  exercises: readonly Exercise[],
): readonly ExerciseMeasure[] {
  const exercise = block.exerciseId
    ? exercises.find((candidate) => candidate.id === block.exerciseId)
    : undefined
  if (exercise) return exercise.measures
  const used: ExerciseMeasure[] = []
  if (block.sets.some((set) => set.weightKg !== null)) used.push('weight')
  if (block.sets.some((set) => set.reps !== null)) used.push('reps')
  if (block.sets.some((set) => set.durationS !== null)) used.push('time')
  if (block.sets.some((set) => set.distanceM !== null)) used.push('distance')
  return used.length ? used : DEFAULT_MEASURES
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

export function formatVolume(kg: number): string {
  return `${formatNumber(Math.round(kg), 0)} kg`
}

/** "999 kg", "1.3 t", "12 t": the week's tonnage, in tonnes from 1,000 kg (`tonnageParts`). */
export function formatTonnage(kg: number): string {
  const parts = tonnageParts(kg)
  return `${formatNumber(parts.value, parts.decimals)} ${parts.unit}`
}

export function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds} s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s === 0 ? `${m} min` : `${m} min ${s} s`
}

export function formatDistance(metres: number): string {
  return metres >= 1000 ? `${formatNumber(metres / 1000, 2)} km` : `${formatNumber(metres, 0)} m`
}

/** "100 kg × 5", "12 reps", "60 s", "2.5 km in 12 min"; empty for a blank set. */
export function setLabel(set: WorkoutSet, measures: readonly ExerciseMeasure[]): string {
  const parts: string[] = []
  const weight = measures.includes('weight') && set.weightKg !== null
  const reps = measures.includes('reps') && set.reps !== null
  if (weight && reps) parts.push(`${formatNumber(set.weightKg ?? 0, 2)} kg × ${set.reps}`)
  else if (weight) parts.push(`${formatNumber(set.weightKg ?? 0, 2)} kg`)
  else if (reps) parts.push(`${set.reps} reps`)
  if (measures.includes('distance') && set.distanceM !== null) {
    parts.push(formatDistance(set.distanceM))
  }
  if (measures.includes('time') && set.durationS !== null) {
    const time = formatSeconds(set.durationS)
    parts.push(parts.length && measures.includes('distance') ? `in ${time}` : time)
  }
  return parts.join(' ')
}

/** The measures a set label shows for the metric a lift is ranked on. */
const METRIC_MEASURES: Readonly<Record<SetMetric, readonly ExerciseMeasure[]>> = {
  volume: ['weight', 'reps'],
  weight: ['weight', 'reps'],
  reps: ['reps'],
  time: ['distance', 'time'],
  distance: ['distance', 'time'],
}

/**
 * A set in the metric it was ranked on (D39): "450 kg (30 kg × 15)" for kg lifted in a set,
 * else `setLabel` on the measures that go with the metric: "105 kg × 5", "75 s", "5 km in 30 min".
 */
export function metricSetLabel(set: WorkoutSet, metric: SetMetric): string {
  const label = setLabel(set, METRIC_MEASURES[metric])
  if (metric !== 'volume') return label
  const volume = setMetricValue(set, 'volume')
  return volume === null ? label : `${formatNumber(volume, 0)} kg (${label})`
}

/** "450 kg", "12 reps", "1 min 15 s", "5 km": a value in a metric. */
export function formatMetricValue(value: number, metric: SetMetric): string {
  switch (metric) {
    case 'volume':
      return `${formatNumber(value, 0)} kg`
    case 'weight':
      return `${formatNumber(value, 2)} kg`
    case 'reps':
      return `${formatNumber(value, 0)} ${value === 1 ? 'rep' : 'reps'}`
    case 'time':
      return formatSeconds(Math.round(value))
    case 'distance':
      return formatDistance(value)
  }
}

/** "+100 kg", "−2 reps", "+15 s", "+200 m": a change in a metric, with its sign. */
export function metricDeltaLabel(delta: number, metric: SetMetric): string {
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : ''
  return `${sign}${formatMetricValue(Math.abs(delta), metric)}`
}

/** "48 min · 12 sets · 1,308 kg" for a session card; the parts that apply, in that order. */
export function sessionLine(
  workout: Pick<WorkoutInput, 'exercises' | 'startedAt' | 'endedAt'>,
): string {
  const summary = workoutSummary(workout)
  const parts: string[] = []
  if (summary.durationMin !== null) parts.push(formatDuration(summary.durationMin))
  parts.push(`${summary.workingSets} ${summary.workingSets === 1 ? 'set' : 'sets'}`)
  if (summary.volumeKg > 0) parts.push(formatVolume(summary.volumeKg))
  return parts.join(' · ')
}

/** A typed number from an input: blank is null, nonsense is null, "," works as ".". */
export function parseNumber(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.')
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

export function workoutTitle(title: string): string {
  return title.trim() || 'Workout'
}

/** What a session row needs: a saved session or a draft still on this phone. */
export type SessionSummary = Pick<
  Workout,
  'id' | 'day' | 'title' | 'startedAt' | 'endedAt' | 'exercises'
> & {
  /** Not on the server yet (logged offline). */
  local: boolean
}

/**
 * Saved sessions plus the drafts that have not reached the server, newest first. A draft
 * whose id the server already knows is the same session, so the saved copy wins.
 */
export function mergeSessions(
  saved: readonly Workout[],
  drafts: readonly WorkoutDraft[],
  day?: string,
): SessionSummary[] {
  const all: SessionSummary[] = [
    ...drafts
      .filter((draft) => !saved.some((workout) => workout.id === draft.id))
      .map((draft) => ({ id: draft.id, ...draft.input, local: true })),
    ...saved.map((workout) => ({ ...workout, local: false })),
  ]
  return all
    .filter((session) => day === undefined || session.day === day)
    .sort((a, b) =>
      a.day === b.day ? b.startedAt.localeCompare(a.startedAt) : b.day.localeCompare(a.day),
    )
}
