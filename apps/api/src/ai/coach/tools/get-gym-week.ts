import {
  addDays,
  coachToolArgsSchemas,
  compareWeeks,
  primaryMeasure,
  summariseWorkouts,
  workoutSummary,
  type Exercise,
} from '@diet-tracker/shared'
import { listExercises } from '../../../training/exercises-service.js'
import { listWorkouts } from '../../../training/workouts-service.js'
import { measuresOf } from '../briefing.js'
import { METRIC_NOTES, dayLabel, metricValueText, setText, weekdayShort, whole } from '../format.js'
import { defineTool, empty } from './types.js'

const MAX_SESSIONS = 20

/** The gym Week screen for a seven-day window: sessions, totals and week on week. */
export const getGymWeek = defineTool({
  name: 'get_gym_week',
  description:
    'Gym sessions in the seven days ending on week_end (title, day, exercises, working sets, kg lifted, minutes), the week totals against the planned training days, and week on week per lift against the seven days before. The briefing has the week ending today; use this for an earlier week.',
  schema: coachToolArgsSchemas.get_gym_week,
  status: (args) =>
    args.week_end
      ? `Looking at the gym week ending ${dayLabel(args.week_end)}`
      : "Looking at this week's sessions",
  async run(ctx, args) {
    const end = args.week_end ?? ctx.today
    if (end > ctx.today) return empty(`the week ending ${end} has not happened yet`)
    const start = addDays(end, -6)
    const previousStart = addDays(start, -7)
    const [workouts, exercises] = await Promise.all([
      listWorkouts(ctx.userId, { from: previousStart, to: end }),
      listExercises(ctx.userId),
    ])
    const current = workouts.filter((w) => w.day >= start)
    const previous = workouts.filter((w) => w.day < start)
    if (current.length === 0) return empty(`no sessions between ${start} and ${end}`)
    const totals = summariseWorkouts(current)
    const measureOf = (exerciseId: string | null, exerciseName: string) => {
      const found = findExercise(exercises, exerciseId, exerciseName)
      return found ? primaryMeasure(found.measures) : null
    }
    const comparison = compareWeeks(current, previous, {
      measureOf,
      basis: ctx.profile.preferences.bestBy,
    })
    const describe = (lift: (typeof comparison.lifts)[number]) => ({
      exercise: lift.exerciseName,
      metric: lift.metric,
      this_week: `${metricValueText(lift.current.value, lift.metric)} (${setText(lift.current.best, measuresOf(lift.exerciseId, lift.exerciseName, exercises))})`,
      last_week: `${metricValueText(lift.previous.value, lift.metric)} (${setText(lift.previous.best, measuresOf(lift.exerciseId, lift.exerciseName, exercises))})`,
      change: `${lift.delta > 0 ? '+' : ''}${metricValueText(lift.delta, lift.metric)}`,
    })
    return {
      start,
      end,
      planned_days: ctx.profile.trainingDaysPerWeek,
      sessions: totals.sessions,
      days_trained: totals.daysTrained,
      working_sets: totals.workingSets,
      lifted_kg: whole(totals.volumeKg),
      minutes: totals.minutes,
      best_means:
        ctx.profile.preferences.bestBy === 'volume' ? METRIC_NOTES.volume : 'the heaviest weight',
      session_list: [...current]
        .sort((a, b) => (a.day < b.day ? -1 : 1))
        .slice(0, MAX_SESSIONS)
        .map((w) => {
          const summary = workoutSummary(w)
          return {
            id: w.id,
            day: w.day,
            weekday: weekdayShort(w.day),
            title: w.title || 'Workout',
            finished: w.endedAt !== null,
            exercises: w.exercises.map((b) => b.exerciseName),
            working_sets: summary.workingSets,
            lifted_kg: whole(summary.volumeKg),
            minutes: summary.durationMin,
          }
        }),
      week_on_week:
        comparison.previous.sessions === 0
          ? { note: 'no finished sessions the week before, nothing to compare' }
          : {
              lifted_kg_last_week: whole(comparison.previous.volumeKg),
              sessions_last_week: comparison.previous.sessions,
              lifts: comparison.lifts.map(describe),
              only_this_week: comparison.onlyThisWeek.map((l) => l.exerciseName),
              only_last_week: comparison.onlyLastWeek.map((l) => l.exerciseName),
            },
    }
  },
})

function findExercise(
  exercises: readonly Exercise[],
  exerciseId: string | null,
  exerciseName: string,
): Exercise | undefined {
  return (
    (exerciseId ? exercises.find((e) => e.id === exerciseId) : undefined) ??
    exercises.find((e) => e.name.toLowerCase() === exerciseName.toLowerCase())
  )
}
