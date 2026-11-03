import {
  WEIGHT_HISTORY_DAYS,
  coachToolArgsSchemas,
  weightRate,
  weightTrend,
} from '@diet-tracker/shared'
import { listWeights } from '../../../progress/weight-service.js'
import { fmt, weekdayShort } from '../format.js'
import { defineTool, empty } from './types.js'

const DEFAULT_DAYS = 28
const MAX_POINTS = 40

/** Weigh-ins over a window with the seven-day trend and the rate, as the Progress screen shows them. */
export const getWeightHistory = defineTool({
  name: 'get_weight_history',
  description: `Weigh-ins over the last N days (${WEIGHT_HISTORY_DAYS.min} to ${WEIGHT_HISTORY_DAYS.max}) with the seven-day trend, the rate in kg a week, the change over the window, the goal weight and the pace the plan expects. The briefing has the last 28 days; use this for a longer or shorter window.`,
  schema: coachToolArgsSchemas.get_weight_history,
  status: (args) => `Looking at your last ${args.days ?? DEFAULT_DAYS} days of weigh-ins`,
  async run(ctx, args) {
    const days = args.days ?? DEFAULT_DAYS
    const weights = await listWeights(ctx.userId, ctx.profile, { days }, ctx.now)
    if (weights.entries.length === 0) return empty(`no weigh-ins in the last ${days} days`)
    const trend = weightTrend(weights.entries)
    const rate = weightRate(trend)
    const first = trend[0]!
    const last = trend[trend.length - 1]!
    const latest = weights.entries[weights.entries.length - 1]!
    const shown = trend.slice(-MAX_POINTS)
    return {
      days,
      weigh_ins: weights.entries.length,
      latest: { day: latest.day, weekday: weekdayShort(latest.day), kg: fmt(latest.weightKg) },
      trend_now_kg: fmt(last.trendKg),
      trend_start: { day: first.day, kg: fmt(first.trendKg) },
      change_kg: `${last.trendKg - first.trendKg >= 0 ? '+' : ''}${fmt(last.trendKg - first.trendKg)}`,
      rate_kg_per_week: rate ? `${rate.kgPerWeek > 0 ? '+' : ''}${fmt(rate.kgPerWeek)}` : null,
      rate_note: rate ? `over ${rate.spanDays} days` : 'too few days between weigh-ins for a rate',
      plan_expects_kg_per_week:
        weights.expectedKgPerWeek === 0 ? '0 (maintain)' : fmt(weights.expectedKgPerWeek),
      goal_weight_kg: weights.goalWeightKg !== null ? fmt(weights.goalWeightKg) : null,
      ...(trend.length > MAX_POINTS ? { points_not_shown: trend.length - MAX_POINTS } : {}),
      points: shown.map((p) => ({ day: p.day, kg: fmt(p.weightKg), trend_kg: fmt(p.trendKg) })),
    }
  },
})
