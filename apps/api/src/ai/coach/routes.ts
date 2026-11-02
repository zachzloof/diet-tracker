import {
  COACH_MAX_TURNS,
  coachSendRequestSchema,
  type CoachEvent,
  type CoachThreadResponse,
  type CoachThreadsResponse,
  type CoachTurnResponse,
} from '@diet-tracker/shared'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { requireAuth } from '../../auth/session-middleware.js'
import { env } from '../../env.js'
import { AI_UNAVAILABLE_MESSAGES, errors } from '../../errors.js'
import { jsonBody, requireJson } from '../../middleware/validate.js'
import { getProfile } from '../../profile/profile-service.js'
import type { AppEnv } from '../../types.js'
import { aiConfigured } from '../openai.js'
import { runTurn } from './agent.js'
import {
  addAssistantMessage,
  addUserMessage,
  createThread,
  deleteThread,
  getThread,
  listMessages,
  listThreads,
  requireThread,
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
 * agent and answers as server-sent events (`status`, `delta`, then `done`), or as one JSON
 * body with `?stream=false` for tests and the smoke script.
 */
export const coachRoutes = new Hono<AppEnv>()
  .get('/threads', async (c) => {
    const { user } = requireAuth(c)
    const body: CoachThreadsResponse = { threads: await listThreads(user.id) }
    return c.json(body, 200)
  })

  .post('/threads', async (c) => {
    const { user } = requireAuth(c)
    await requireProfile(user.id)
    const thread = await createThread(user.id)
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
