import { coachToolArgsSchemas } from '@diet-tracker/shared'
import { assess } from '../../../progress/recalibration-service.js'
import { fmt } from '../format.js'
import { defineTool } from './types.js'

/** The fortnightly plan check in full: status, evidence and any proposal. The engine decides. */
export const getRecalibration = defineTool({
  name: 'get_recalibration',
  description:
    'The plan check (recalibration): whether it is due, what the last 14 days of logged intake and weigh-ins show against the expected pace, and the engine’s proposal if any. The briefing has the status; use this for the evidence behind it.',
  schema: coachToolArgsSchemas.get_recalibration,
  status: () => 'Checking the plan check',
  async run(ctx) {
    const { assessment } = await assess(ctx.userId, ctx.profile, ctx.now)
    const e = assessment.evidence
    return {
      status: assessment.status,
      reason: assessment.reason,
      due_on: assessment.dueOn,
      snoozed_until: assessment.snoozedUntil,
      evidence: {
        window: `${e.windowStart} to ${e.windowEnd}`,
        days_logged: e.daysLogged,
        weigh_ins: e.weighIns,
        span_days: e.spanDays,
        average_intake_kcal: e.averageIntakeKcal !== null ? fmt(e.averageIntakeKcal) : null,
        trend_start_kg: e.startTrendKg !== null ? fmt(e.startTrendKg) : null,
        trend_end_kg: e.endTrendKg !== null ? fmt(e.endTrendKg) : null,
        actual_kg_per_week: e.actualKgPerWeek !== null ? fmt(e.actualKgPerWeek) : null,
        expected_kg_per_week: fmt(e.expectedKgPerWeek),
      },
      proposal: assessment.proposal
        ? {
            energy_change_kcal: fmt(assessment.proposal.deltaKcal),
            current: assessment.proposal.current,
            proposed: assessment.proposal.proposed,
            from_weight_kg: fmt(assessment.proposal.weightKg),
            notes: assessment.proposal.notes,
            how_to_apply: 'the person taps Apply on the card on Today; the coach cannot',
          }
        : null,
    }
  },
})
