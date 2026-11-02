import { z } from 'zod'

/**
 * Cards the coach drafts for the person to confirm (D41: the coach never writes). Slice 11a
 * ships the read-only coach, so the union is empty and a message's `cards` list is always
 * `[]`; slice 11b fills it with `estimate`, `target_change`, `workout`, `meal` and `note`.
 * Keep in step with `.claude/skills/ai-coach/references/tools.md`.
 */
export const coachCardSchema = z.never()
export type CoachCard = z.infer<typeof coachCardSchema>

export const coachCardsSchema = z.array(coachCardSchema)
