import { z } from 'zod'

/**
 * The daily brief (slice 11c, D41): one line on Today in each half, built in code from
 * the coach's briefing with the model asked only for the sentence. Generated at most
 * once a day per half when Today opens (D17's pattern), cached on the day, and opened
 * as the first assistant line of a new chat when tapped.
 */

/** The two halves of the app (D38), as the router names them. */
export const COACH_BRIEF_HALVES = ['diet', 'training'] as const
export const coachBriefHalfSchema = z.enum(COACH_BRIEF_HALVES)
export type CoachBriefHalf = z.infer<typeof coachBriefHalfSchema>

/** One line on a phone; a longer sentence from the model is replaced by the app's own. */
export const COACH_BRIEF_MAX_CHARS = 160

export const coachBriefSchema = z.object({
  half: coachBriefHalfSchema,
  /** The person's local day the brief is about. */
  day: z.iso.date(),
  text: z.string().min(1).max(COACH_BRIEF_MAX_CHARS),
  /**
   * The model that wrote the sentence, or null when the app's own sentence is shown: nothing
   * logged yet (an invitation, never judged), no key, the daily cap, or a failed call.
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

/** What the model answers with (Structured Outputs): the sentence and nothing else. */
export const coachBriefSentenceSchema = z.object({ sentence: z.string() })
export type CoachBriefSentence = z.infer<typeof coachBriefSentenceSchema>

/**
 * `POST /coach/threads` takes an optional body: `brief` opens the chat with that half's
 * brief as the first assistant line (reusing today's unanswered brief thread if there is one).
 */
export const coachThreadCreateSchema = z.object({
  brief: coachBriefHalfSchema.optional(),
})
export type CoachThreadCreate = z.infer<typeof coachThreadCreateSchema>
