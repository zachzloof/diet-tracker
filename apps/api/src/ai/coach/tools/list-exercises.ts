import {
  EXERCISE_KIND_LABELS,
  MUSCLE_GROUP_LABELS,
  coachToolArgsSchemas,
} from '@diet-tracker/shared'
import { listExercises } from '../../../training/exercises-service.js'
import { defineTool, empty } from './types.js'

const LIMIT = 30

/** The exercise catalogue and the person's own, most recently used first. */
export const listExercisesTool = defineTool({
  name: 'list_exercises',
  description:
    'The exercises the person can log: the shared catalogue and their own, most recently used first, filtered by part of the name or a muscle group. Returns ids for get_lift_history.',
  schema: coachToolArgsSchemas.list_exercises,
  status: (args) =>
    args.query
      ? `Looking for "${args.query}" in exercises`
      : args.muscle_group
        ? `Looking through ${MUSCLE_GROUP_LABELS[args.muscle_group].toLowerCase()} exercises`
        : 'Looking through exercises',
  async run(ctx, args) {
    const needle = (args.query ?? '').trim().toLowerCase()
    const all = (await listExercises(ctx.userId)).filter(
      (e) =>
        (!needle || e.name.toLowerCase().includes(needle)) &&
        (!args.muscle_group || e.muscleGroups.includes(args.muscle_group)),
    )
    if (all.length === 0) return empty('no exercise matches')
    return {
      matches: all.length,
      ...(all.length > LIMIT ? { not_shown: all.length - LIMIT } : {}),
      exercises: all.slice(0, LIMIT).map((e) => ({
        id: e.id,
        name: e.name,
        kind: EXERCISE_KIND_LABELS[e.kind],
        muscles: e.muscleGroups.map((g) => MUSCLE_GROUP_LABELS[g]),
        measures: e.measures,
        custom: e.custom,
        last_used: e.lastUsedAt?.slice(0, 10) ?? null,
      })),
    }
  },
})
