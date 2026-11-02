import { z } from 'zod'
import { MAX_FOOD_QUERY_CHARS } from '../log/schemas.js'
import { WEIGHT_HISTORY_DAYS } from '../progress-api.js'
import { MAX_EXERCISE_HISTORY } from '../training/schemas.js'
import { muscleGroupSchema } from '../training/enums.js'

/**
 * Argument schemas of the coach's read tools (ai-coach skill, `references/tools.md`).
 * Strict function tools: every field is required and an optional one is `| null`, no extra
 * properties. Formats are plain regexes because Structured Outputs rejects `format: date`.
 * `userId` is never an argument: the API passes it from the session.
 */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const MONTH_RE = /^\d{4}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const toolDay = z.string().regex(DAY_RE, 'Use YYYY-MM-DD')
const toolMonth = z.string().regex(MONTH_RE, 'Use YYYY-MM')
const toolUuid = z.string().regex(UUID_RE, 'Not an id')

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
  /** Days back from today, 7 to 183; null for 28. */
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
} as const satisfies Record<CoachReadTool, z.ZodType>

export type CoachToolArgs = { [K in CoachReadTool]: z.infer<(typeof coachToolArgsSchemas)[K]> }
