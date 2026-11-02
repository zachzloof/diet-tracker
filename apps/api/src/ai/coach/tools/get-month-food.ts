import { coachToolArgsSchemas, daysOfMonth, monthOf } from '@diet-tracker/shared'
import { scoreDays } from '../../../stats/stats-service.js'
import { monthLabel, weekdayShort, whole } from '../format.js'
import { defineTool, empty } from './types.js'

/** Logged and met per day of a month, the History calendar's dots with kcal and protein. */
export const getMonthFood = defineTool({
  name: 'get_month_food',
  description:
    'A month of days: for each day with anything logged, whether it was met with its kcal and protein, plus the counts. Use for "how was October" or "how many days did I log last month".',
  schema: coachToolArgsSchemas.get_month_food,
  status: (args, ctx) => `Looking at ${monthLabel(args.month ?? monthOf(ctx.today))}`,
  async run(ctx, args) {
    const month = args.month ?? monthOf(ctx.today)
    const days = daysOfMonth(month).filter((day) => day <= ctx.today)
    if (days.length === 0) return empty(`${month} has not started yet`)
    const scored = await scoreDays(ctx.userId, days)
    const logged = scored.days.filter((d) => scored.present.has(d.day) && d.score.logged)
    if (logged.length === 0) return empty(`nothing logged in ${monthLabel(month)}`)
    return {
      month,
      label: monthLabel(month),
      days_so_far: days.length,
      days_logged: logged.length,
      days_met: logged.filter((d) => d.score.dayMet).length,
      days: logged.map((d) => ({
        day: d.day,
        weekday: weekdayShort(d.day),
        met: d.score.dayMet,
        kcal: whole(d.score.scores.energy_kcal?.actual ?? 0),
        protein_g: whole(d.score.scores.protein_g?.actual ?? 0),
        ...(d.day === ctx.today ? { in_progress: true } : {}),
      })),
    }
  },
})
