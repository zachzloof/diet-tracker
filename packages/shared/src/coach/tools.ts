import { z } from 'zod'
import { mealSchema } from '../log/enums.js'
import { MAX_ESTIMATE_CHARS, MAX_FOOD_QUERY_CHARS } from '../log/schemas.js'
import { targetKeySchema } from '../nutrition/targets.js'
import { WEIGHT_HISTORY_DAYS } from '../progress-api.js'
import {
  MAX_EXERCISE_HISTORY,
  MAX_SETS_PER_EXERCISE,
  MAX_SET_DISTANCE_M,
  MAX_SET_DURATION_S,
  MAX_SET_REPS,
  MAX_SET_WEIGHT_KG,
  MAX_WORKOUT_EXERCISES,
} from '../training/schemas.js'
import { muscleGroupSchema } from '../training/enums.js'

/**
 * Argument schemas of the coach's tools (ai-coach skill, `references/tools.md`). Strict
 * function tools: every field is required and an optional one is `| null`, no extra
 * properties. Formats are plain regexes because Structured Outputs rejects `format: date`.
 * `userId` is never an argument: the API passes it from the session.
 */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const MONTH_RE = /^\d{4}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const toolDay = z.string().regex(DAY_RE, 'Use YYYY-MM-DD')
const toolMonth = z.string().regex(MONTH_RE, 'Use YYYY-MM')
const toolUuid = z.string().regex(UUID_RE, 'Not an id')

// --- Read tools ----------------------------------------------------------------------------

export const getDayFoodArgsSchema = z.object({
  /** The user-local day, YYYY-MM-DD. */
  day: toolDay,
})

export const getWeekFoodArgsSchema = z.object({
  /** Last day of the seven-day window; null for the window ending today. */
  week_end: toolDay.nullable(),
})

export const getMonthFoodArgsSchema = z.object({
  /** YYYY-MM; null for the current month. */
  month: toolMonth.nullable(),
})

export const getTargetsArgsSchema = z.object({})

export const getGymWeekArgsSchema = z.object({
  /** Last day of the seven-day window; null for the window ending today. */
  week_end: toolDay.nullable(),
})

export const getWorkoutArgsSchema = z.object({
  /** A session id from an earlier result, or null to look up by day. */
  id: toolUuid.nullable(),
  /** A user-local day; the sessions of that day. Null when `id` is given. */
  day: toolDay.nullable(),
})

export const getLiftHistoryArgsSchema = z.object({
  /** An exercise id from `list_exercises` or an earlier result, or null to match by name. */
  exercise_id: toolUuid.nullable(),
  /** Part of the exercise's name ("squat"); used when `exercise_id` is null. */
  exercise_name: z.string().max(60).nullable(),
  /** Sessions to look back, 1 to 20; null for 5. */
  sessions: z.number().int().min(1).max(MAX_EXERCISE_HISTORY).nullable(),
})

export const getWeightHistoryArgsSchema = z.object({
  /** Days back from today, 7 to 365; null for 28. */
  days: z.number().int().min(WEIGHT_HISTORY_DAYS.min).max(WEIGHT_HISTORY_DAYS.max).nullable(),
})

export const getRecalibrationArgsSchema = z.object({})

export const searchMyFoodsArgsSchema = z.object({
  /** Part of a food's name or brand. */
  query: z.string().max(MAX_FOOD_QUERY_CHARS),
})

export const searchMealsArgsSchema = z.object({
  /** Part of a saved meal's name; empty for every meal. */
  query: z.string().max(MAX_FOOD_QUERY_CHARS),
})

export const listExercisesArgsSchema = z.object({
  /** Part of an exercise's name, or null. */
  query: z.string().max(60).nullable(),
  /** Limit to a muscle group, or null. */
  muscle_group: muscleGroupSchema.nullable(),
})

export const getWeeklyReviewArgsSchema = z.object({
  /** Last day of the reviewed week; null for the week ending today. */
  week_end: toolDay.nullable(),
})

// --- Draft tools (slice 11b): each returns a card, nothing is written -----------------------

export const draftFoodLogArgsSchema = z.object({
  /** What was eaten, in the person's words ("2 eggs and toast"), for the estimator. */
  text: z.string().min(1).max(MAX_ESTIMATE_CHARS),
  /** The user-local day to log to; null for today. */
  day: toolDay.nullable(),
  /** The meal the person named; null to let the estimator infer it from the food and the time. */
  meal: mealSchema.nullable(),
})

export const draftTargetChangeArgsSchema = z.object({
  /** The target to pin, as the briefing names its key (energy_kcal, protein_g, ...). */
  key: targetKeySchema,
  /** The number to pin, in the target's unit; null clears the pin and the engine's number returns. */
  value: z.number().min(0).max(100_000).nullable(),
  /** One line on why, in the person's terms; shown on the card. */
  reason: z.string().max(200),
})

export const draftWorkoutSetArgsSchema = z.object({
  weight_kg: z.number().min(0).max(MAX_SET_WEIGHT_KG).nullable(),
  reps: z.number().int().min(0).max(MAX_SET_REPS).nullable(),
  time_s: z.number().int().min(0).max(MAX_SET_DURATION_S).nullable(),
  distance_m: z.number().min(0).max(MAX_SET_DISTANCE_M).nullable(),
})

export const draftWorkoutExerciseArgsSchema = z.object({
  /** An exercise id from `list_exercises`, `get_workout` or `get_lift_history`, or null to match by name. */
  exercise_id: toolUuid.nullable(),
  /** The exercise's name, used when `exercise_id` is null and kept as the block's label. */
  exercise_name: z.string().min(1).max(80),
  /** The planned sets in order; a null field is left for the person to fill in. */
  sets: z.array(draftWorkoutSetArgsSchema).min(1).max(MAX_SETS_PER_EXERCISE),
})

export const draftWorkoutArgsSchema = z.object({
  /** "Upper body", "Legs": the session's title. */
  title: z.string().min(1).max(60),
  /** The user-local day it is for; null for today. */
  day: toolDay.nullable(),
  exercises: z.array(draftWorkoutExerciseArgsSchema).min(1).max(MAX_WORKOUT_EXERCISES),
  /** A line for the session's notes, or empty. */
  notes: z.string().max(300),
})

export const draftMealItemArgsSchema = z.object({
  /** A food id from `search_my_foods`. */
  food_id: toolUuid,
  /** How much, in `unit`. */
  amount: z.number().positive().max(100_000),
  /** Grams, or servings of the food's own serving. */
  unit: z.enum(['g', 'serving']),
})

export const draftMealArgsSchema = z.object({
  name: z.string().min(1).max(80),
  items: z.array(draftMealItemArgsSchema).min(1).max(20),
  /** The meal it is usually eaten at, or null. */
  meal: mealSchema.nullable(),
})

/** Longest note the coach may keep. */
export const COACH_NOTE_MAX_CHARS = 200

export const rememberNoteArgsSchema = z.object({
  /** One line in the person's words, under 200 characters ("left knee sore since Tuesday"). */
  text: z.string().min(1).max(COACH_NOTE_MAX_CHARS),
})

export const COACH_READ_TOOLS = [
  'get_day_food',
  'get_week_food',
  'get_month_food',
  'get_targets',
  'get_gym_week',
  'get_workout',
  'get_lift_history',
  'get_weight_history',
  'get_recalibration',
  'search_my_foods',
  'search_meals',
  'list_exercises',
  'get_weekly_review',
] as const
export type CoachReadTool = (typeof COACH_READ_TOOLS)[number]

export const COACH_DRAFT_TOOLS = [
  'draft_food_log',
  'draft_target_change',
  'draft_workout',
  'draft_meal',
  'remember_note',
] as const
export type CoachDraftTool = (typeof COACH_DRAFT_TOOLS)[number]

export const COACH_TOOL_NAMES = [...COACH_READ_TOOLS, ...COACH_DRAFT_TOOLS] as const
export type CoachToolName = (typeof COACH_TOOL_NAMES)[number]

export const coachToolArgsSchemas = {
  get_day_food: getDayFoodArgsSchema,
  get_week_food: getWeekFoodArgsSchema,
  get_month_food: getMonthFoodArgsSchema,
  get_targets: getTargetsArgsSchema,
  get_gym_week: getGymWeekArgsSchema,
  get_workout: getWorkoutArgsSchema,
  get_lift_history: getLiftHistoryArgsSchema,
  get_weight_history: getWeightHistoryArgsSchema,
  get_recalibration: getRecalibrationArgsSchema,
  search_my_foods: searchMyFoodsArgsSchema,
  search_meals: searchMealsArgsSchema,
  list_exercises: listExercisesArgsSchema,
  get_weekly_review: getWeeklyReviewArgsSchema,
  draft_food_log: draftFoodLogArgsSchema,
  draft_target_change: draftTargetChangeArgsSchema,
  draft_workout: draftWorkoutArgsSchema,
  draft_meal: draftMealArgsSchema,
  remember_note: rememberNoteArgsSchema,
} as const satisfies Record<CoachToolName, z.ZodType>

export type CoachToolArgs = { [K in CoachToolName]: z.infer<(typeof coachToolArgsSchemas)[K]> }
