import {
  bestSetBy,
  coachToolArgsSchemas,
  liftMetric,
  primaryMeasure,
  setMetricValue,
  type Exercise,
  type SetMetric,
} from '@diet-tracker/shared'
import { exerciseHistory, listExercises } from '../../../training/exercises-service.js'
import { METRIC_NOTES, METRIC_UNITS, dayLabel, fmt, metricValueText, setText } from '../format.js'
import { defineTool, empty } from './types.js'

const DEFAULT_SESSIONS = 5

/** Resolves the lift by id or by a name fragment; recently used first, as the picker orders them. */
function resolve(
  exercises: readonly Exercise[],
  id: string | null,
  name: string | null,
): { exercise: Exercise | null; others: Exercise[] } {
  if (id) return { exercise: exercises.find((e) => e.id === id) ?? null, others: [] }
  const needle = (name ?? '').trim().toLowerCase()
  if (!needle) return { exercise: null, others: [] }
  const matches = exercises.filter((e) => e.name.toLowerCase().includes(needle))
  const used = matches.filter((e) => e.lastUsedAt !== null)
  const pool = used.length > 0 ? used : matches
  const exact = pool.find((e) => e.name.toLowerCase() === needle)
  const chosen = exact ?? pool[0] ?? null
  return { exercise: chosen, others: pool.filter((e) => e !== chosen).slice(0, 5) }
}

/** The lift page: best set per session on the person's basis, the best, the latest, the trend. */
export const getLiftHistory = defineTool({
  name: 'get_lift_history',
  description:
    'One exercise over its last sessions (1 to 20): the best working set in each on the person’s "best" basis (kg lifted in one set, or the heaviest weight; reps, time or distance for other exercises), the best and the latest, and the change from the first session in the window to the last. Match by exercise_id or by part of the name ("squat").',
  schema: coachToolArgsSchemas.get_lift_history,
  status: (args) =>
    `Looking at your last ${args.sessions ?? DEFAULT_SESSIONS} ${args.exercise_name?.trim() || 'sessions of that lift'}${args.exercise_name ? ' sessions' : ''}`,
  async run(ctx, args) {
    const exercises = await listExercises(ctx.userId)
    const { exercise, others } = resolve(exercises, args.exercise_id, args.exercise_name)
    if (!exercise) {
      return empty(
        args.exercise_name
          ? `no exercise matches "${args.exercise_name}"; try list_exercises`
          : 'no exercise with that id',
      )
    }
    const limit = args.sessions ?? DEFAULT_SESSIONS
    const history = await exerciseHistory(ctx.userId, exercise.id, limit)
    if (history.length === 0) {
      return empty(`${exercise.name} has not been logged in a finished session yet`)
    }
    const measures = exercise.measures
    const metric: SetMetric = liftMetric(
      primaryMeasure(measures) ?? 'weight',
      ctx.profile.preferences.bestBy,
      measures.includes('reps'),
    )
    // Oldest first, as the lift page charts them; the API answers newest first.
    const points = [...history].reverse().map((entry) => {
      const best = bestSetBy(entry.sets, metric)
      return { entry, best, value: best ? setMetricValue(best, metric) : null }
    })
    const latest = points[points.length - 1]!
    const best = points.reduce<(typeof points)[number] | null>(
      (top, p) => (p.value !== null && (top === null || p.value > (top.value ?? 0)) ? p : top),
      null,
    )
    const withValue = points.filter((p) => p.value !== null)
    const first = withValue[0]
    const last = withValue[withValue.length - 1]
    const trend =
      first && last && first !== last && first.value !== null && last.value !== null
        ? {
            from: `${metricValueText(first.value, metric)} on ${first.entry.day}`,
            to: `${metricValueText(last.value, metric)} on ${last.entry.day}`,
            change: `${last.value - first.value > 0 ? '+' : ''}${fmt(last.value - first.value)} ${METRIC_UNITS[metric]}`,
            change_pct:
              first.value > 0
                ? `${Math.round(((last.value - first.value) / first.value) * 100)}%`
                : null,
            sessions_compared: withValue.length,
          }
        : null
    return {
      exercise: exercise.name,
      exercise_id: exercise.id,
      measures,
      metric: METRIC_NOTES[metric],
      sessions_shown: points.length,
      best:
        best?.value !== null && best?.best
          ? {
              value: metricValueText(best.value ?? 0, metric),
              set: setText(best.best, measures),
              day: best.entry.day,
              label: dayLabel(best.entry.day),
            }
          : null,
      latest:
        latest.best && latest.value !== null
          ? {
              value: metricValueText(latest.value, metric),
              set: setText(latest.best, measures),
              day: latest.entry.day,
              label: dayLabel(latest.entry.day),
            }
          : { day: latest.entry.day, note: 'no working set' },
      trend,
      sessions: points.map((p) => ({
        day: p.entry.day,
        label: dayLabel(p.entry.day),
        title: p.entry.title || 'Workout',
        best_set: p.best ? setText(p.best, measures) : null,
        value: p.value !== null ? metricValueText(p.value, metric) : null,
        sets: p.entry.sets.length,
        workout_id: p.entry.workoutId,
      })),
      ...(others.length ? { other_matches: others.map((e) => e.name) } : {}),
    }
  },
})
