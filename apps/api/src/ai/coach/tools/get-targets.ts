import { type TARGET_TRIGGERS, coachToolArgsSchemas, shownTargetKeys } from '@diet-tracker/shared'
import { listVersions, requireLatestVersion } from '../../../profile/targets-service.js'
import { fmt, keyLabel, keyUnit } from '../format.js'
import { defineTool } from './types.js'

const TRIGGER_WORDS: Record<(typeof TARGET_TRIGGERS)[number], string> = {
  onboarding: 'set up',
  profile_change: 'profile changed',
  recalibration: 'plan check applied',
}

/** Every target with its reason and pin, how the engine got there, and the version history. */
export const getTargets = defineTool({
  name: 'get_targets',
  description:
    'Every target (energy, macros, fibre, water, limits, vitamins, minerals, food groups) with the engine’s reason and whether the person pinned it, the engine’s inputs (BMR, activity, TDEE, goal adjustment, floor), and the history of target versions. The briefing has the main targets; use this for a vitamin, mineral or food group, or for "why" and "when did it change".',
  schema: coachToolArgsSchemas.get_targets,
  status: () => 'Checking your targets',
  async run(ctx) {
    const [version, history] = await Promise.all([
      requireLatestVersion(ctx.userId),
      listVersions(ctx.userId),
    ])
    const targets = version.effective
    const shownKeys = new Set(
      shownTargetKeys(
        targets.entries.map((e) => e.key),
        ctx.profile.preferences,
      ),
    )
    return {
      effective_from: version.effectiveFrom,
      set_by: TRIGGER_WORDS[version.trigger],
      how: {
        formula: targets.meta.formula,
        bmr_kcal: fmt(targets.meta.bmr),
        activity_multiplier: targets.meta.pal,
        tdee_kcal: fmt(targets.meta.tdee),
        goal_adjustment_kcal: fmt(targets.meta.energyAdjustmentKcal),
        recalibration_kcal: fmt(targets.meta.recalibrationKcal),
        energy_floor_kcal: fmt(targets.meta.floorKcal),
        protein_g_per_kg: targets.meta.proteinGPerKg,
        fat_percent_of_energy: targets.meta.fatPercent,
        notes: targets.meta.notes,
      },
      targets: targets.entries
        .filter((e) => shownKeys.has(e.key))
        .map((e) => ({
          target: keyLabel(e.key),
          key: e.key,
          kind: e.kind,
          value: fmt(e.value),
          unit: keyUnit(e.key),
          pinned_by_person: e.overridden,
          ...(e.uncapped ? { uncapped: true } : {}),
          ...(e.floor !== null ? { safety_floor: fmt(e.floor) } : {}),
          reason: e.reason,
        })),
      history: history.slice(0, 10).map((v) => ({
        effective_from: v.effectiveFrom,
        set_by: TRIGGER_WORDS[v.trigger],
        weight_kg: fmt(v.weightKg),
        goal: v.goal,
        energy_kcal: fmt(v.energyKcal),
        protein_g: fmt(v.proteinG),
        carbs_g: fmt(v.carbsG),
        fat_g: fmt(v.fatG),
        pinned_targets: v.overrideCount,
      })),
    }
  },
})
