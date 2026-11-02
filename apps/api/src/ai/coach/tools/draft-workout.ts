import {
  DEFAULT_MEASURES,
  coachToolArgsSchemas,
  type Exercise,
  type ExerciseMeasure,
  type WorkoutCard,
  type WorkoutCardExercise,
  type WorkoutCardSet,
  type WorkoutSet,
} from '@diet-tracker/shared'
import { v7 as uuidv7 } from 'uuid'
import { exerciseHistory, listExercises } from '../../../training/exercises-service.js'
import { dayLabel, relativeDayLabel, setText } from '../format.js'
import { defineTool, empty, type DraftResult } from './types.js'

/** The exercise by id, else the best name match: exact wins, then recently used, then any. */
function resolve(exercises: readonly Exercise[], id: string | null, name: string): Exercise | null {
  if (id) return exercises.find((e) => e.id === id) ?? null
  const needle = name.trim().toLowerCase()
  if (!needle) return null
  const exact = exercises.filter((e) => e.name.toLowerCase() === needle)
  const partial = exercises.filter((e) => e.name.toLowerCase().includes(needle))
  const pool = exact.length ? exact : partial
  return pool.find((e) => e.lastUsedAt !== null) ?? pool[0] ?? null
}

function toCardSet(
  set: Pick<WorkoutSet, 'weightKg' | 'reps' | 'durationS' | 'distanceM'>,
): WorkoutCardSet {
  return {
    weightKg: set.weightKg,
    reps: set.reps,
    durationS: set.durationS,
    distanceM: set.distanceM,
  }
}

function measuresFromSets(sets: readonly WorkoutCardSet[]): ExerciseMeasure[] {
  const used: ExerciseMeasure[] = []
  if (sets.some((s) => s.weightKg !== null)) used.push('weight')
  if (sets.some((s) => s.reps !== null)) used.push('reps')
  if (sets.some((s) => s.durationS !== null)) used.push('time')
  if (sets.some((s) => s.distanceM !== null)) used.push('distance')
  return used.length ? used : [...DEFAULT_MEASURES]
}

function asWorkoutSet(set: WorkoutCardSet): WorkoutSet {
  return { id: 'draft', ...set, rpe: null, completed: false }
}

/**
 * A planned session as a card: each exercise matched to the catalogue (so the lift's history
 * keeps working), the planned sets, and what the person did last time beside them. Start
 * opens the session screen with the plan filled in; nothing is saved by this call.
 */
export const draftWorkout = defineTool({
  name: 'draft_workout',
  description:
    'Draft a gym session as a card the person starts with a tap: a title, the exercises in order (by id from list_exercises, get_workout or get_lift_history, or by name) and the planned sets (weight kg, reps, time s, distance m; null leaves a field for them to fill). The card shows last time’s sets beside each exercise. Nothing is saved by this call. To plan "like last week", read that session with get_gym_week or get_workout first and build from it.',
  schema: coachToolArgsSchemas.draft_workout,
  status: (args) => `Planning ${args.title}`,
  async run(ctx, args): Promise<DraftResult | ReturnType<typeof empty>> {
    const day = args.day ?? ctx.today
    if (day > ctx.today) {
      return empty(
        `${day} has not happened yet; a session is started on the day, plan it for today`,
      )
    }
    const catalogue = await listExercises(ctx.userId)
    const unmatched: string[] = []
    const exercises: WorkoutCardExercise[] = await Promise.all(
      args.exercises.map(async (block) => {
        const exercise = resolve(catalogue, block.exercise_id, block.exercise_name)
        if (!exercise) unmatched.push(block.exercise_name)
        const sets = block.sets.map((set) => ({
          weightKg: set.weight_kg,
          reps: set.reps,
          durationS: set.time_s,
          distanceM: set.distance_m,
        }))
        const history = exercise ? await exerciseHistory(ctx.userId, exercise.id, 1) : []
        const last = history[0]
        return {
          exerciseId: exercise?.id ?? null,
          exerciseName: exercise?.name ?? block.exercise_name.trim(),
          measures: exercise ? [...exercise.measures] : measuresFromSets(sets),
          sets,
          last: last ? { day: last.day, sets: last.sets.map(toCardSet) } : null,
        }
      }),
    )
    const card: WorkoutCard = {
      id: uuidv7(),
      kind: 'workout',
      state: 'drafted',
      title: args.title.trim(),
      day,
      exercises,
      notes: args.notes.trim(),
    }
    return {
      card,
      summary: {
        card: 'workout',
        shows:
          'a workout card the person opens with "Start"; the session is not saved until they do',
        title: card.title,
        day: `${day} (${relativeDayLabel(day, ctx.today)})`,
        exercises: exercises.map((block) => ({
          exercise: block.exerciseName,
          matched: block.exerciseId !== null,
          sets: block.sets.map((set) => setText(asWorkoutSet(set), block.measures)),
          last_time: block.last
            ? `${block.last.sets.map((set) => setText(asWorkoutSet(set), block.measures)).join(', ')} on ${dayLabel(block.last.day)}`
            : 'not logged before',
        })),
        ...(unmatched.length
          ? {
              unmatched: `${unmatched.join(', ')}: no exercise by that name; the block opens with the name only, so its history will not link. Try list_exercises for the catalogue name.`,
            }
          : {}),
      },
    }
  },
})
