import type { CoachReadTool } from '@diet-tracker/shared'
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
import { searchMeals } from './search-meals.js'
import { searchMyFoods } from './search-my-foods.js'
import type { AnyCoachTool } from './types.js'

export type { AnyCoachTool, CoachTool, ToolContext } from './types.js'

/** Every read tool, in the order the model sees them. */
export const COACH_TOOLS: readonly AnyCoachTool[] = [
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

const byName = new Map<string, AnyCoachTool>(COACH_TOOLS.map((tool) => [tool.name, tool]))

export function toolByName(name: string): AnyCoachTool | undefined {
  return byName.get(name)
}

export function isCoachTool(name: string): name is CoachReadTool {
  return byName.has(name)
}
