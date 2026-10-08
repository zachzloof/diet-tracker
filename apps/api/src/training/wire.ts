import { workoutSetSchema, type WorkoutSet } from '@diet-tracker/shared'
import type { WorkoutSetRow } from '../db/schema/index.js'

/** Validates the row on the way out so a stray shape never reaches the browser. */
export function toWireSet(row: WorkoutSetRow): WorkoutSet {
  return workoutSetSchema.parse({
    id: row.id,
    weightKg: row.weightKg,
    reps: row.reps,
    durationS: row.durationS,
    distanceM: row.distanceM,
    rpe: row.rpe,
    isWarmup: row.isWarmup,
    completed: row.completed,
  })
}
