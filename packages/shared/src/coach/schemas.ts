import { z } from 'zod'
import { coachCardsSchema } from './cards.js'

/**
 * Wire shapes for `/api/v1/coach` (slice 11a, D41). A thread is one conversation; a turn
 * is one user message and the assistant message that answers it. Mechanics in the
 * `ai-coach` skill.
 */

/** Longest message a person can send. Checked before any model call. */
export const COACH_MAX_MESSAGE_CHARS = 1000
/** Turns per thread; past this the composer offers "New chat". */
export const COACH_MAX_TURNS = 40
/** Model rounds per turn (each a model call); past this the model answers with what it has. */
export const COACH_MAX_TOOL_ROUNDS = 6
/** Turns replayed in full; older ones are replayed as one-line summaries. */
export const COACH_REPLAY_TURNS = 12
/** Output tokens per answer round. */
export const COACH_MAX_OUTPUT_TOKENS = 700
/** Threads returned by the list, newest first. */
export const COACH_MAX_THREADS_LISTED = 50
/** Characters of the first message kept as the thread's title. */
export const COACH_TITLE_CHARS = 60
/** The text each message beyond the replay window is cut to. */
export const COACH_SUMMARY_CHARS = 160

export const COACH_ROLES = ['user', 'assistant'] as const
export const coachRoleSchema = z.enum(COACH_ROLES)
export type CoachRole = z.infer<typeof coachRoleSchema>

export const coachThreadSchema = z.object({
  id: z.uuid(),
  /** The first message, trimmed to `COACH_TITLE_CHARS`. */
  title: z.string(),
  /** User messages so far. */
  turns: z.number().int().min(0),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type CoachThread = z.infer<typeof coachThreadSchema>

/** One tool call the assistant made while answering, kept so the thread shows what it looked at. */
export const coachToolTrailEntrySchema = z.object({
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()),
  /** The status line the person saw ("Looking at your last 5 squat sessions"). */
  summary: z.string(),
  ms: z.number().int().min(0),
  ok: z.boolean(),
})
export type CoachToolTrailEntry = z.infer<typeof coachToolTrailEntrySchema>

export const coachMessageSchema = z.object({
  id: z.uuid(),
  threadId: z.uuid(),
  role: coachRoleSchema,
  text: z.string(),
  cards: coachCardsSchema,
  toolTrail: z.array(coachToolTrailEntrySchema),
  /** Set when the assistant could not answer; `text` is then the failure copy. */
  error: z.string().nullable(),
  createdAt: z.iso.datetime(),
})
export type CoachMessage = z.infer<typeof coachMessageSchema>

export const coachThreadsResponseSchema = z.object({ threads: z.array(coachThreadSchema) })
export type CoachThreadsResponse = z.infer<typeof coachThreadsResponseSchema>

export const coachThreadResponseSchema = z.object({
  thread: coachThreadSchema,
  /** Oldest first. */
  messages: z.array(coachMessageSchema),
})
export type CoachThreadResponse = z.infer<typeof coachThreadResponseSchema>

export const coachSendRequestSchema = z.object({
  text: z
    .string({ error: 'Type a message' })
    .trim()
    .min(1, 'Type a message')
    .max(COACH_MAX_MESSAGE_CHARS, `Keep it under ${COACH_MAX_MESSAGE_CHARS} characters`),
})
export type CoachSendRequest = z.infer<typeof coachSendRequestSchema>

/** The JSON answer (`?stream=false`) and the payload of the `done` event. */
export const coachTurnResponseSchema = z.object({
  thread: coachThreadSchema,
  user: coachMessageSchema,
  assistant: coachMessageSchema,
})
export type CoachTurnResponse = z.infer<typeof coachTurnResponseSchema>

/**
 * Server-sent events on `POST /coach/threads/:id/messages`, in order: zero or more `status`
 * and `delta`, then one `done` or one `error`. The browser reads them with `fetch` and a
 * `ReadableStream`; `EventSource` cannot POST.
 */
export const coachStatusEventSchema = z.object({
  /** The tool the model reached for. */
  tool: z.string(),
  /** A short line for the screen: "Looking at this week". */
  text: z.string(),
})
export const coachDeltaEventSchema = z.object({ text: z.string() })
export const coachErrorEventSchema = z.object({
  code: z.string(),
  message: z.string(),
})
export const coachEventSchema = z.discriminatedUnion('event', [
  z.object({ event: z.literal('status'), data: coachStatusEventSchema }),
  z.object({ event: z.literal('delta'), data: coachDeltaEventSchema }),
  z.object({ event: z.literal('card'), data: z.object({ card: z.unknown() }) }),
  z.object({ event: z.literal('done'), data: coachTurnResponseSchema }),
  z.object({ event: z.literal('error'), data: coachErrorEventSchema }),
])
export type CoachEvent = z.infer<typeof coachEventSchema>
export type CoachEventName = CoachEvent['event']

/** What the thread shows when the assistant fails after the question was kept. */
export const COACH_UNAVAILABLE_TEXT =
  'The coach is unavailable right now. Your question is kept; try again in a moment.'
