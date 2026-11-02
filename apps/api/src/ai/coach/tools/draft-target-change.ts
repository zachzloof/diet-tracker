import {
  checkOverride,
  coachToolArgsSchemas,
  computeTargets,
  targetFor,
  type Overrides,
  type TargetChangeCard,
  type TargetDependant,
} from '@diet-tracker/shared'
import { v7 as uuidv7 } from 'uuid'
import { requireLatestVersion } from '../../../profile/targets-service.js'
import { fmt, keyLabel, keyUnit } from '../format.js'
import { defineTool, empty, type DraftResult } from './types.js'

/** A dependant moved when the engine's number changed by more than rounding. */
const MOVED = 0.05

/**
 * Dry-runs a pin through the engine exactly as `PATCH /targets/overrides` would apply it:
 * the floor and range check on the engine's own entry, then `computeTargets` with the new
 * overrides so the dependants (fat and carbs after energy or protein) are the real ones.
 * Nothing is written; the card's Apply goes through the existing patch.
 */
export const draftTargetChange = defineTool({
  name: 'draft_target_change',
  description:
    'Draft a change to one target as a card the person applies with a tap: the number now, the number after, the targets the engine recomputes from it (fat and carbs when energy or protein moves), and any floor or range warning. value null clears a pin so the engine’s number comes back. Nothing changes until the person taps Apply. Use when they ask to change, raise, lower, set or reset a target; never pin a value under the safety floor.',
  schema: coachToolArgsSchemas.draft_target_change,
  status: (args) =>
    args.value === null
      ? `Checking what clearing your ${keyLabel(args.key).toLowerCase()} pin would change`
      : `Checking what ${fmt(args.value)} ${keyUnit(args.key)} ${keyLabel(args.key).toLowerCase()} would change`,
  async run(ctx, args): Promise<DraftResult | ReturnType<typeof empty> | object> {
    const version = await requireLatestVersion(ctx.userId)
    const computed = targetFor(version.computed, args.key)
    const current = targetFor(version.effective, args.key)
    if (!computed || !current) {
      return empty(`${args.key} is not one of this person's targets; the briefing lists them`)
    }
    const label = keyLabel(args.key)
    const unit = keyUnit(args.key)
    if (args.value === null && !current.overridden) {
      return {
        refused: true,
        reason: `${label} is not pinned; it is already the engine's ${fmt(current.value)} ${unit}`,
      }
    }
    const check = args.value === null ? null : checkOverride(computed, args.value)
    if (check?.level === 'blocked') {
      return {
        refused: true,
        reason: check.message,
        floor: computed.floor !== null ? `${fmt(computed.floor)} ${unit}` : null,
        note: 'Do not draft a value under the floor; explain the floor and, if useful, offer the floor itself.',
      }
    }
    const next: Overrides = { ...version.overrides }
    if (args.value === null) delete next[args.key]
    else next[args.key] = args.value
    const after = computeTargets(version.inputs, next)
    const afterEntry = targetFor(after, args.key)
    if (!afterEntry) return empty(`${args.key} disappeared from the recomputed targets`)

    const dependants: TargetDependant[] = after.entries.flatMap((entry) => {
      if (entry.key === args.key) return []
      const before = targetFor(version.effective, entry.key)
      if (!before || Math.abs(before.value - entry.value) < MOVED) return []
      return [
        {
          key: entry.key,
          label: keyLabel(entry.key),
          unit: entry.unit,
          before: before.value,
          after: entry.value,
        },
      ]
    })

    const card: TargetChangeCard = {
      id: uuidv7(),
      kind: 'target_change',
      state: 'drafted',
      key: args.key,
      label,
      unit: current.unit,
      before: current.value,
      after: afterEntry.value,
      value: args.value,
      pinnedBefore: current.overridden,
      recommended: computed.value,
      floor: computed.floor,
      warning: check?.message ?? null,
      dependants,
      reason: args.reason.trim(),
    }
    return {
      card,
      summary: {
        card: 'target_change',
        shows:
          'a target change card the person applies with "Apply"; nothing changes until they tap it, and they may decline',
        target: label,
        before: `${fmt(current.value)} ${unit}${current.overridden ? ' (pinned)' : ''}`,
        after: `${fmt(afterEntry.value)} ${unit}${args.value === null ? " (the engine's number, pin cleared)" : ' (pinned)'}`,
        recommended: `${fmt(computed.value)} ${unit}`,
        ...(computed.floor !== null ? { floor: `${fmt(computed.floor)} ${unit}` } : {}),
        ...(check?.message ? { warning: check.message } : {}),
        dependants: dependants.length
          ? dependants.map(
              (d) => `${d.label}: ${fmt(d.before)} → ${fmt(d.after)} ${keyUnit(d.key)}`,
            )
          : 'none; no other target moves',
      },
    }
  },
})
