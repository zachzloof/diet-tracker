import {
  DEFAULT_MEASURES,
  workoutSummary,
  type Exercise,
  type ExerciseMeasure,
  type WorkoutExerciseInput,
  type WorkoutInput,
  type WorkoutSet,
} from '@diet-tracker/shared'
import { formatNumber } from '@/lib/format'

/** Pure helpers for the session screen and the cards; the maths lives in `@diet-tracker/shared`. */

/** What a block's set rows show: the exercise's measures when it is known, else weight and reps. */
export function blockMeasures(
  block: Pick<WorkoutExerciseInput, 'exerciseId'>,
  exercises: readonly Exercise[],
): readonly ExerciseMeasure[] {
  const exercise = block.exerciseId
    ? exercises.find((candidate) => candidate.id === block.exerciseId)
    : undefined
  return exercise?.measures ?? DEFAULT_MEASURES
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
