import {
  MEALS,
  MEAL_LABELS,
  coachToolArgsSchemas,
  evaluateDay,
  isWaterEntry,
  lastPlanDay,
  shownTargetKeys,
  type LogEntry,
  type TargetKey,
} from '@diet-tracker/shared'
import { getDay } from '../../../log/log-service.js'
import { targetsByDay } from '../../../stats/stats-service.js'
import { keyLabel, keyUnit, relativeDayLabel, whole } from '../format.js'
import { defineTool, empty } from './types.js'

const KEYS: readonly TargetKey[] = [
  'energy_kcal',
  'protein_g',
  'carbs_g',
  'fat_g',
  'fiber_g',
  'water_ml',
  'sodium_mg',
  'saturated_fat_g',
  'added_sugar_g',
]
const MAX_ENTRIES = 20

function itemLine(e: LogEntry) {
  return {
    name: e.groupName ? `${e.name} (part of ${e.groupName})` : e.name,
    quantity: `${e.quantity} ${e.unit}`,
    kcal: whole(e.nutrients.energy_kcal),
    protein_g: whole(e.nutrients.protein_g),
    carbs_g: whole(e.nutrients.carbs_g),
    fat_g: whole(e.nutrients.fat_g),
    confidence: e.confidence,
  }
}

/**
 * The day's entries by meal with the kcal the Today screen shows, totals and the verdict.
 * Planned food (D43) comes back on its own list, in none of the meals or totals; tomorrow
 * can be read too, and holds nothing else.
 */
export const getDayFood = defineTool({
  name: 'get_day_food',
  description:
    'What the person ate on one day: entries grouped by meal with kcal and macros, the totals against that day’s targets, and whether the day was met, plus anything planned and not eaten yet, listed apart and in none of the totals. Tomorrow can be read for its plan. Use for a specific day, not for today or this week (the briefing has those).',
  schema: coachToolArgsSchemas.get_day_food,
  status: (args, ctx) => `Looking at ${relativeDayLabel(args.day, ctx.today)}`,
  async run(ctx, args) {
    if (args.day > lastPlanDay(ctx.today)) return empty(`${args.day} has not happened yet`)
    const [day, targets] = await Promise.all([
      getDay(ctx.userId, args.day),
      targetsByDay(ctx.userId, [args.day]),
    ])
    const food = day.entries.filter((e) => !isWaterEntry(e) && !e.planned)
    const planned = day.entries.filter((e) => e.planned)
    if (food.length === 0 && planned.length === 0 && day.summary.totals.water_ml === 0) {
      return empty(`nothing logged on ${args.day} (${relativeDayLabel(args.day, ctx.today)})`)
    }
    const dayTargets = targets.get(args.day)
    const score = dayTargets
      ? evaluateDay(
          {
            totals: day.summary.totals,
            foodGroups: day.summary.foodGroups,
            entryCount: day.summary.entryCount,
          },
          dayTargets,
        )
      : null
    const shown = food.slice(0, MAX_ENTRIES)
    const meals = MEALS.flatMap((meal) => {
      const items = shown.filter((e) => e.meal === meal)
      if (items.length === 0) return []
      return [{ meal: MEAL_LABELS[meal], items: items.map(itemLine) }]
    })
    return {
      day: args.day,
      label: relativeDayLabel(args.day, ctx.today),
      entries: food.length,
      ...(food.length > MAX_ENTRIES ? { entries_not_shown: food.length - MAX_ENTRIES } : {}),
      meals,
      ...(planned.length > 0
        ? { planned_not_eaten: planned.slice(0, MAX_ENTRIES).map(itemLine) }
        : {}),
      water_ml: whole(day.summary.totals.water_ml),
      totals: score
        ? shownTargetKeys(KEYS, ctx.profile.preferences).flatMap((key) => {
            const s = score.scores[key]
            if (!s) return []
            return [
              {
                target: keyLabel(key),
                actual: whole(s.actual),
                target_value: whole(s.target),
                unit: keyUnit(key),
                status: s.status,
              },
            ]
          })
        : [],
      logged: score?.logged ?? false,
      day_met: score?.dayMet ?? false,
      ...(args.day === ctx.today ? { note: 'today is in progress' } : {}),
      ...(args.day > ctx.today ? { note: 'this day has not happened; it only holds a plan' } : {}),
    }
  },
})
