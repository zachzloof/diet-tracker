import { z } from 'zod'

/**
 * The daily brief (slice 11c, D41): one line on Today in each half, built in code from
 * the coach's briefing every time it is asked for, so it moves with the log. No model
 * writes it (since 2026-11-05). Tapping it opens a new chat with the line as the first
 * assistant message.
 */

/** The two halves of the app (D38), as the router names them. */
export const COACH_BRIEF_HALVES = ['diet', 'training'] as const
export const coachBriefHalfSchema = z.enum(COACH_BRIEF_HALVES)
export type CoachBriefHalf = z.infer<typeof coachBriefHalfSchema>

/** One line on a phone. */
export const COACH_BRIEF_MAX_CHARS = 160

export const coachBriefSchema = z.object({
  half: coachBriefHalfSchema,
  /** The person's local day the brief is about. */
  day: z.iso.date(),
  text: z.string().min(1).max(COACH_BRIEF_MAX_CHARS),
  /**
   * Null for every brief built today: the app writes the line. Set only on the stored
   * briefs a model wrote before 2026-11-05, which the export still carries.
   */
  model: z.string().nullable(),
  generatedAt: z.iso.datetime(),
  /** True when the day has nothing to brief on yet; the text then invites the first entry. */
  empty: z.boolean(),
})
export type CoachBrief = z.infer<typeof coachBriefSchema>

export const coachBriefRequestSchema = z.object({ half: coachBriefHalfSchema })
export type CoachBriefRequest = z.infer<typeof coachBriefRequestSchema>

export const coachBriefResponseSchema = z.object({ brief: coachBriefSchema })
export type CoachBriefResponse = z.infer<typeof coachBriefResponseSchema>

/**
 * `POST /coach/threads` takes an optional body: `brief` opens the chat with that half's
 * brief as the first assistant line (reusing an unanswered brief thread with the same line).
 */
export const coachThreadCreateSchema = z.object({
  brief: coachBriefHalfSchema.optional(),
})
export type CoachThreadCreate = z.infer<typeof coachThreadCreateSchema>
