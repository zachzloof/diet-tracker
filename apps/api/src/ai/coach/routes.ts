import {
  COACH_MAX_TURNS,
  coachBriefRequestSchema,
  coachCardStateRequestSchema,
  coachNoteInputSchema,
  coachSendRequestSchema,
  coachThreadCreateSchema,
  type CoachBriefResponse,
  type CoachCardStateResponse,
  type CoachEvent,
  type CoachNoteResponse,
  type CoachNotesResponse,
  type CoachThreadResponse,
  type CoachThreadsResponse,
  type CoachTurnResponse,
} from '@diet-tracker/shared'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { requireAuth } from '../../auth/session-middleware.js'
import { env } from '../../env.js'
import { AI_UNAVAILABLE_MESSAGES, errors, validationDetails } from '../../errors.js'
import { jsonBody, requireJson } from '../../middleware/validate.js'
import { getProfile } from '../../profile/profile-service.js'
import type { AppEnv } from '../../types.js'
import { aiConfigured } from '../openai.js'
import { runTurn } from './agent.js'
import { getBrief } from './brief.js'
import { createNote, deleteNote, listNotes } from './notes-service.js'
import {
  addAssistantMessage,
  addUserMessage,
  createThread,
  deleteThread,
  getThread,
  listMessages,
  listThreads,
  openBriefThread,
  requireThread,
  setCardState,
  toWireThread,
  turnsToday,
} from './threads-service.js'

const uuid = z.uuid()

function idParam(value: string): string {
  const parsed = uuid.safeParse(value)
  if (!parsed.success) throw errors.notFound()
  return parsed.data
}

async function requireProfile(userId: string) {
  const profile = await getProfile(userId)
  if (!profile) throw errors.profileRequired()
  return profile
}

export const COACH_THREAD_FULL_MESSAGE = 'This chat is full. Start a new chat to carry on.'

/**
 * `/api/v1/coach` (D41). Threads are the person's own; a message runs one turn of the
 * agent and answers as server-sent events (`status`, `delta`, `card`, then `done`), or as
 * one JSON body with `?stream=false` for tests and the smoke script. Cards (slice 11b) are
 * confirmed through the endpoint they belong to; this API only records their state. Notes
 * are the one thing the coach's own routes write, and only from a confirmed `note` card.
 */
export const coachRoutes = new Hono<AppEnv>()
  .get('/notes', async (c) => {
    const { user } = requireAuth(c)
    const body: CoachNotesResponse = { notes: await listNotes(user.id) }
    return c.json(body, 200)
  })

  .post('/notes', requireJson, jsonBody(coachNoteInputSchema), async (c) => {
    const { user } = requireAuth(c)
    const body: CoachNoteResponse = { note: await createNote(user.id, c.req.valid('json')) }
    return c.json(body, 201)
  })

  .delete('/notes/:id', async (c) => {
    const { user } = requireAuth(c)
    await deleteNote(user.id, idParam(c.req.param('id')))
    return c.body(null, 204)
  })

  .get('/threads', async (c) => {
    const { user } = requireAuth(c)
    const body: CoachThreadsResponse = { threads: await listThreads(user.id) }
    return c.json(body, 200)
  })

  /**
   * Today's one-line brief for a half (slice 11c): cached for the day once the model has
   * written it; the app's own line (an invitation when nothing is logged) otherwise.
   */
  .post('/brief', requireJson, jsonBody(coachBriefRequestSchema), async (c) => {
    const { user } = requireAuth(c)
    const profile = await requireProfile(user.id)
    const body: CoachBriefResponse = {
      brief: await getBrief(user.id, profile, c.req.valid('json').half),
    }
    return c.json(body, 200)
  })

  /** A new chat; with `{ brief }` in the body, one that opens with that half's brief. */
  .post('/threads', async (c) => {
    const { user } = requireAuth(c)
    const profile = await requireProfile(user.id)
    const raw: unknown = (c.req.header('content-type') ?? '').includes('application/json')
      ? await c.req.json().catch(() => ({}))
      : {}
    const parsed = coachThreadCreateSchema.safeParse(raw ?? {})
    if (!parsed.success) throw errors.validation(validationDetails(parsed.error))
    const thread = parsed.data.brief
      ? await openBriefThread(user.id, (await getBrief(user.id, profile, parsed.data.brief)).text)
      : await createThread(user.id)
    return c.json({ thread }, 201)
  })

  .get('/threads/:id', async (c) => {
    const { user } = requireAuth(c)
    const body: CoachThreadResponse = await getThread(user.id, idParam(c.req.param('id')))
    return c.json(body, 200)
  })

  .delete('/threads/:id', async (c) => {
    const { user } = requireAuth(c)
    await deleteThread(user.id, idParam(c.req.param('id')))
    return c.body(null, 204)
  })

  /** The person confirmed (through the card's own endpoint) or dismissed a card. */
  .patch(
    '/threads/:id/cards/:cardId',
    requireJson,
    jsonBody(coachCardStateRequestSchema),
    async (c) => {
      const { user } = requireAuth(c)
      const body: CoachCardStateResponse = {
        message: await setCardState(
          user.id,
          idParam(c.req.param('id')),
          idParam(c.req.param('cardId')),
          c.req.valid('json'),
        ),
      }
      return c.json(body, 200)
    },
  )

  .post('/threads/:id/messages', requireJson, jsonBody(coachSendRequestSchema), async (c) => {
    const { user } = requireAuth(c)
    const { text } = c.req.valid('json')
    const now = new Date()
    const profile = await requireProfile(user.id)
    const thread = await requireThread(user.id, idParam(c.req.param('id')))
    if (!aiConfigured()) throw errors.aiUnavailable(AI_UNAVAILABLE_MESSAGES.coach)
    if (thread.turns >= COACH_MAX_TURNS) throw errors.conflict(COACH_THREAD_FULL_MESSAGE)
    const used = await turnsToday(user.id, profile.timezone, now)
    if (used >= env.AI_COACH_DAILY_TURN_CAP) {
      throw errors.coachCapReached(env.AI_COACH_DAILY_TURN_CAP, used)
    }

    const history = await listMessages(thread.id)
    const stored = await addUserMessage(thread, text, now)

    const turn = (emit: (event: CoachEvent) => void | Promise<void>) =>
      runTurn({ userId: user.id, profile, history, text, now, emit })

    const finish = async (
      result: Awaited<ReturnType<typeof runTurn>>,
    ): Promise<CoachTurnResponse> => {
      const assistant = await addAssistantMessage(thread, result, new Date())
      return {
        thread: toWireThread(await requireThread(user.id, thread.id)),
        user: stored.message,
        assistant,
      }
    }

    if (c.req.query('stream') === 'false') {
      const body = await finish(await turn(() => undefined))
      return c.json(body, 200)
    }

    return streamSSE(
      c,
      async (stream) => {
        const result = await turn((event) =>
          stream.writeSSE({ event: event.event, data: JSON.stringify(event.data) }),
        )
        const body = await finish(result)
        await stream.writeSSE({ event: 'done', data: JSON.stringify(body) })
      },
      async (error, stream) => {
        c.get('log').error({ err: error }, 'coach stream failed')
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({
            code: 'ai_unavailable',
            message: AI_UNAVAILABLE_MESSAGES.coach,
          }),
        })
      },
    )
  })
