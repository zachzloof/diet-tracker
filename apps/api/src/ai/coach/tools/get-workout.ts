import { coachToolArgsSchemas, workoutSummary, type Workout } from '@diet-tracker/shared'
import { AppError } from '../../../errors.js'
import { listExercises } from '../../../training/exercises-service.js'
import { getWorkout, listWorkouts } from '../../../training/workouts-service.js'
import { measuresOf } from '../briefing.js'
import { minutesBetween, relativeDayLabel, setText, whole } from '../format.js'
import { defineTool, empty } from './types.js'

/** One session as the session screen shows it: every exercise and set, notes and feel. */
export const getWorkoutTool = defineTool({
  name: 'get_workout',
  description:
    'One gym session in full: exercises in order with every set (weight, reps, time, distance, done or not), notes and how it felt. Give a session id from an earlier result, or a day to get that day’s sessions.',
  schema: coachToolArgsSchemas.get_workout,
  status: (args, ctx) =>
    args.day
      ? `Looking at ${relativeDayLabel(args.day, ctx.today)}'s session`
      : 'Opening that session',
  async run(ctx, args) {
    let workouts: Workout[]
    if (args.id) {
      try {
        workouts = [await getWorkout(ctx.userId, args.id)]
      } catch (error) {
        if (error instanceof AppError && error.code === 'not_found') {
          return empty('no session with that id')
        }
        throw error
      }
    } else if (args.day) {
      if (args.day > ctx.today) return empty(`${args.day} has not happened yet`)
      workouts = await listWorkouts(ctx.userId, { from: args.day, to: args.day })
      if (workouts.length === 0) {
        return empty(`no session on ${args.day} (${relativeDayLabel(args.day, ctx.today)})`)
      }
    } else {
      return empty('give a session id or a day')
    }
    const exercises = await listExercises(ctx.userId)
    return {
      sessions: workouts.map((w) => {
        const summary = workoutSummary(w)
        return {
          id: w.id,
          day: w.day,
          label: relativeDayLabel(w.day, ctx.today),
          title: w.title || 'Workout',
          finished: w.endedAt !== null,
          minutes: minutesBetween(w.startedAt, w.endedAt),
          feel_1_to_5: w.feel,
          notes: w.notes || null,
          working_sets: summary.workingSets,
          lifted_kg: whole(summary.volumeKg),
          exercises: w.exercises.map((block) => {
            const measures = measuresOf(block.exerciseId, block.exerciseName, exercises)
            return {
              exercise: block.exerciseName,
              exercise_id: block.exerciseId,
              notes: block.notes || null,
              sets: block.sets.map((set) => ({
                set: setText(set, measures),
                done: set.completed,
                ...(set.rpe !== null ? { rpe: set.rpe } : {}),
              })),
            }
          }),
        }
      }),
    }
  },
})
