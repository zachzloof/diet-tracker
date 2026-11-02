import type { CoachToolName } from '@diet-tracker/shared'
import { draftFoodLog } from './draft-food-log.js'
import { draftMeal } from './draft-meal.js'
import { draftTargetChange } from './draft-target-change.js'
import { draftWorkout } from './draft-workout.js'
import { getDayFood } from './get-day-food.js'
import { getGymWeek } from './get-gym-week.js'
import { getLiftHistory } from './get-lift-history.js'
import { getMonthFood } from './get-month-food.js'
import { getRecalibration } from './get-recalibration.js'
import { getTargets } from './get-targets.js'
import { getWeekFood } from './get-week-food.js'
import { getWeeklyReview } from './get-weekly-review.js'
import { getWeightHistory } from './get-weight-history.js'
import { getWorkoutTool } from './get-workout.js'
import { listExercisesTool } from './list-exercises.js'
import { rememberNote } from './remember-note.js'
import { searchMeals } from './search-meals.js'
import { searchMyFoods } from './search-my-foods.js'
import type { AnyCoachTool } from './types.js'

export type { AnyCoachTool, CoachTool, DraftResult, ToolContext } from './types.js'
export { isDraftResult } from './types.js'

/** Every read tool, in the order the model sees them. */
export const COACH_READ_TOOL_LIST: readonly AnyCoachTool[] = [
  getDayFood,
  getWeekFood,
  getMonthFood,
  getTargets,
  getGymWeek,
  getWorkoutTool,
  getLiftHistory,
  getWeightHistory,
  getRecalibration,
  searchMyFoods,
  searchMeals,
  listExercisesTool,
  getWeeklyReview,
]

/** The draft tools (slice 11b): each returns a card and writes nothing. */
export const COACH_DRAFT_TOOL_LIST: readonly AnyCoachTool[] = [
  draftFoodLog,
  draftTargetChange,
  draftWorkout,
  draftMeal,
  rememberNote,
]

export const COACH_TOOLS: readonly AnyCoachTool[] = [
  ...COACH_READ_TOOL_LIST,
  ...COACH_DRAFT_TOOL_LIST,
]

const byName = new Map<string, AnyCoachTool>(COACH_TOOLS.map((tool) => [tool.name, tool]))

export function toolByName(name: string): AnyCoachTool | undefined {
  return byName.get(name)
}

export function isCoachTool(name: string): name is CoachToolName {
  return byName.has(name)
}
