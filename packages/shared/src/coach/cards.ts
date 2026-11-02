import { z } from 'zod'
import { mealSchema } from '../log/enums.js'
import { estimateResponseSchema, savedMealItemSchema } from '../log/schemas.js'
import { targetKeySchema, targetUnitSchema } from '../nutrition/targets.js'
import { exerciseMeasureSchema } from '../training/enums.js'

/**
 * Cards the coach drafts for the person to confirm (D41: the coach never writes). A draft
 * tool returns one of these; the API stores it on the assistant message, streams it as a
 * `card` event, and the web renders it with the existing review components. The confirm
 * goes through the existing endpoint (`POST /log/entries`, `PATCH /targets/overrides`,
 * `POST /meals`, the session screen, `POST /coach/notes`); the card then records its state
 * through `PATCH /coach/threads/:id/cards/:cardId`. Keep in step with
 * `.claude/skills/ai-coach/references/tools.md`.
 */

export const COACH_CARD_STATES = ['drafted', 'confirmed', 'dismissed'] as const
export const coachCardStateSchema = z.enum(COACH_CARD_STATES)
export type CoachCardState = z.infer<typeof coachCardStateSchema>

const base = {
  id: z.uuid(),
  state: coachCardStateSchema,
}

/** The estimator's answer for the text the person asked to log; confirmed as the review card. */
export const estimateCardSchema = z.object({
  ...base,
  kind: z.literal('estimate'),
  /** What was estimated, as the review card quotes it. */
  text: z.string(),
  result: estimateResponseSchema,
})
export type EstimateCard = z.infer<typeof estimateCardSchema>

/** One target the engine recomputed because the pinned one moved (fat and carbs after energy). */
export const targetDependantSchema = z.object({
  key: targetKeySchema,
  label: z.string(),
  unit: targetUnitSchema,
  before: z.number(),
  after: z.number(),
})
export type TargetDependant = z.infer<typeof targetDependantSchema>

/** A pin (or unpin) dry-run through the engine: before, after, dependants, the floor check. */
export const targetChangeCardSchema = z.object({
  ...base,
  kind: z.literal('target_change'),
  key: targetKeySchema,
  label: z.string(),
  unit: targetUnitSchema,
  /** The value in force now. */
  before: z.number(),
  /** The value after the pin; the engine's own when `value` is null (unpin). */
  after: z.number(),
  /** The number to pin; null clears the pin and the engine's number comes back. */
  value: z.number().nullable(),
  pinnedBefore: z.boolean(),
  /** The engine's recommendation with no pin, for the "Use recommended" line. */
  recommended: z.number(),
  floor: z.number().nullable(),
  /** The range or floor warning the engine raised, or null when the value sits inside the usual range. */
  warning: z.string().nullable(),
  dependants: z.array(targetDependantSchema),
  /** The coach's one-line reason, from the conversation. */
  reason: z.string(),
})
export type TargetChangeCard = z.infer<typeof targetChangeCardSchema>

export const workoutCardSetSchema = z.object({
  weightKg: z.number().nullable(),
  reps: z.number().int().nullable(),
  durationS: z.number().int().nullable(),
  distanceM: z.number().nullable(),
})
export type WorkoutCardSet = z.infer<typeof workoutCardSetSchema>

export const workoutCardExerciseSchema = z.object({
  /** Null when the name matched nothing; the block still opens with the name as a snapshot. */
  exerciseId: z.uuid().nullable(),
  exerciseName: z.string(),
  measures: z.array(exerciseMeasureSchema),
  sets: z.array(workoutCardSetSchema),
  /** The most recent finished session with this exercise: its day and sets, position by position. */
  last: z
    .object({
      day: z.string(),
      sets: z.array(workoutCardSetSchema),
    })
    .nullable(),
})
export type WorkoutCardExercise = z.infer<typeof workoutCardExerciseSchema>

/** A planned session; Start opens the session screen with it filled in (client-side). */
export const workoutCardSchema = z.object({
  ...base,
  kind: z.literal('workout'),
  title: z.string(),
  /** The user-local day it is for. */
  day: z.string(),
  exercises: z.array(workoutCardExerciseSchema),
  notes: z.string(),
})
export type WorkoutCard = z.infer<typeof workoutCardSchema>

/** A saved meal to keep, built from My foods; Save goes through `POST /meals`. */
export const mealCardSchema = z.object({
  ...base,
  kind: z.literal('meal'),
  name: z.string(),
  items: z.array(savedMealItemSchema),
  /** For the summary line: whole kcal and grams, as the Meals screen shows them. */
  totals: z.object({
    energy_kcal: z.number(),
    protein_g: z.number(),
    carbs_g: z.number(),
    fat_g: z.number(),
  }),
  /** When the coach also means to log it, the meal it suggested; the person picks on the card. */
  meal: mealSchema.nullable(),
})
export type MealCard = z.infer<typeof mealCardSchema>

/** A line to remember; Confirm goes through `POST /coach/notes`. */
export const noteCardSchema = z.object({
  ...base,
  kind: z.literal('note'),
  text: z.string(),
})
export type NoteCard = z.infer<typeof noteCardSchema>

export const coachCardSchema = z.discriminatedUnion('kind', [
  estimateCardSchema,
  targetChangeCardSchema,
  workoutCardSchema,
  mealCardSchema,
  noteCardSchema,
])
export type CoachCard = z.infer<typeof coachCardSchema>
export type CoachCardKind = CoachCard['kind']

export const coachCardsSchema = z.array(coachCardSchema)

/** `PATCH /coach/threads/:id/cards/:cardId`: the person confirmed or dismissed the card. */
export const coachCardStateRequestSchema = z.object({
  state: z.enum(['confirmed', 'dismissed']),
})
export type CoachCardStateRequest = z.infer<typeof coachCardStateRequestSchema>
