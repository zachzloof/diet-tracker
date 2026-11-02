import {
  coachToolArgsSchemas,
  shownTargetKeys,
  summariseTarget,
  type TargetKey,
} from '@diet-tracker/shared'
import { weekStats } from '../../../stats/stats-service.js'
import { dayLabel, keyLabel, keyUnit, pct, weekdayShort, whole } from '../format.js'
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
  'vegetables',
  'fruit',
  'whole_grains',
  'protein_foods',
  'dairy_or_alt',
]

/** Seven scored days ending on a day, as the Week screen shows them. The briefing has the current week. */
export const getWeekFood = defineTool({
  name: 'get_week_food',
  description:
    'Seven scored days ending on week_end: per day met or not with kcal and protein, the averages against targets, and the ranked gaps. The briefing already has the week ending today; use this for an earlier week.',
  schema: coachToolArgsSchemas.get_week_food,
  status: (args) =>
    args.week_end
      ? `Looking at the week ending ${dayLabel(args.week_end)}`
      : 'Looking at this week',
  async run(ctx, args) {
    const end = args.week_end ?? ctx.today
    if (end > ctx.today) return empty(`the week ending ${end} has not happened yet`)
    const week = await weekStats(ctx.userId, ctx.profile, end, ctx.now)
    if (week.daysLogged === 0) {
      return empty(`nothing logged between ${week.start} and ${week.end}`)
    }
    return {
      start: week.start,
      end: week.end,
      days_logged: week.daysLogged,
      days_met: week.daysMet,
      streak_today: week.streak,
      days: week.days.map((d) => {
        const energy = d.score.scores.energy_kcal
        const protein = d.score.scores.protein_g
        const problems = Object.values(d.score.scores)
          .filter((s) => (s.status === 'short' || s.status === 'over') && s.kind !== 'minimum')
          .map((s) => `${keyLabel(s.key).toLowerCase()} ${s.status}`)
        return {
          day: d.day,
          weekday: weekdayShort(d.day),
          ...(d.day === ctx.today ? { in_progress: true } : {}),
          logged: d.score.logged,
          met: d.score.dayMet,
          kcal: whole(energy?.actual ?? 0),
          protein_g: whole(protein?.actual ?? 0),
          problems,
        }
      }),
      averages: shownTargetKeys(KEYS, ctx.profile.preferences).flatMap((key) => {
        const s = summariseTarget(week.days, key)
        if (s.average === null || s.target === null) return []
        return [
          {
            target: keyLabel(key),
            average: whole(s.average),
            target_value: whole(s.target),
            unit: keyUnit(key),
            share: pct(s.averageRatio).trim(),
            days_met: s.daysMet,
            days_logged: s.daysLogged,
          },
        ]
      }),
      gaps: week.gaps.map((g) => ({
        severity: g.severity,
        title: g.title,
        evidence: g.evidence,
        suggestions: g.suggestions,
      })),
    }
  },
})
