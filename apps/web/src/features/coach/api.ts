import {
  aiCostsResponseSchema,
  coachBriefResponseSchema,
  coachCardStateResponseSchema,
  coachEventSchema,
  coachNoteResponseSchema,
  coachNotesResponseSchema,
  coachThreadResponseSchema,
  coachThreadSchema,
  coachThreadsResponseSchema,
  type AiCostsResponse,
  type CoachBrief,
  type CoachBriefHalf,
  type CoachCardStateRequest,
  type CoachEvent,
  type CoachMessage,
  type CoachNote,
  type CoachThread,
  type CoachThreadResponse,
  type CoachTurnResponse,
} from '@diet-tracker/shared'
import { z } from 'zod'
import { ApiError, request, requestStream, requestVoid } from '@/lib/api'

const createResponseSchema = z.object({ thread: coachThreadSchema })

export interface StreamHandlers {
  onEvent: (event: CoachEvent) => void
  signal?: AbortSignal
}

/**
 * `/api/v1/coach` (D41). A message answers as server-sent events read off a `fetch`
 * body (`EventSource` cannot POST): `status` lines, text `delta`s and drafted `card`s as
 * they arrive, then one `done` with the stored messages, or one `error`. Cards are
 * confirmed through their own endpoint; `setCardState` only records what happened. Notes
 * are the lines the person asked the coach to remember.
 */
export const coachApi = {
  async threads(): Promise<CoachThread[]> {
    const { threads } = await request('/coach/threads', coachThreadsResponseSchema)
    return threads
  },
  /** A new chat; with `brief`, one that opens with that half's brief as its first line (slice 11c). */
  async create(brief?: CoachBriefHalf): Promise<CoachThread> {
    const { thread } = await request('/coach/threads', createResponseSchema, {
      method: 'POST',
      ...(brief ? { body: { brief } } : {}),
    })
    return thread
  },
  /** Today's one-line brief for a half, rebuilt from the current numbers on every call (slice 11c). */
  async brief(half: CoachBriefHalf): Promise<CoachBrief> {
    const { brief } = await request('/coach/brief', coachBriefResponseSchema, {
      method: 'POST',
      body: { half },
    })
    return brief
  },
  /** The owner's cost view; 404 for anyone else. */
  costs(): Promise<AiCostsResponse> {
    return request('/ai/costs', aiCostsResponseSchema)
  },
  get(id: string): Promise<CoachThreadResponse> {
    return request(`/coach/threads/${id}`, coachThreadResponseSchema)
  },
  remove(id: string): Promise<void> {
    return requestVoid(`/coach/threads/${id}`, { method: 'DELETE' })
  },
  async setCardState(
    threadId: string,
    cardId: string,
    input: CoachCardStateRequest,
  ): Promise<CoachMessage> {
    const { message } = await request(
      `/coach/threads/${threadId}/cards/${cardId}`,
      coachCardStateResponseSchema,
      { method: 'PATCH', body: input },
    )
    return message
  },
  async notes(): Promise<CoachNote[]> {
    const { notes } = await request('/coach/notes', coachNotesResponseSchema)
    return notes
  },
  async createNote(text: string): Promise<CoachNote> {
    const { note } = await request('/coach/notes', coachNoteResponseSchema, {
      method: 'POST',
      body: { text },
    })
    return note
  },
  removeNote(id: string): Promise<void> {
    return requestVoid(`/coach/notes/${id}`, { method: 'DELETE' })
  },
  async send(id: string, text: string, handlers: StreamHandlers): Promise<CoachTurnResponse> {
    const res = await requestStream(`/coach/threads/${id}/messages`, {
      method: 'POST',
      body: { text },
      signal: handlers.signal,
    })
    let done: CoachTurnResponse | null = null
    for await (const event of readEvents(res)) {
      handlers.onEvent(event)
      if (event.event === 'done') done = event.data
      if (event.event === 'error') throw new ApiError(503, 'ai_unavailable', event.data.message)
    }
    if (!done) throw new ApiError(0, 'network', 'The answer was cut off. Try again.')
    return done
  },
}

/** Parses `event:` / `data:` frames as they stream in. */
async function* readEvents(res: Response): AsyncGenerator<CoachEvent> {
  const body = res.body
  if (!body) return
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let split = buffer.indexOf('\n\n')
      while (split !== -1) {
        const frame = buffer.slice(0, split)
        buffer = buffer.slice(split + 2)
        const parsed = parseFrame(frame)
        if (parsed) yield parsed
        split = buffer.indexOf('\n\n')
      }
    }
    const last = parseFrame(buffer)
    if (last) yield last
  } finally {
    reader.releaseLock()
  }
}

function parseFrame(frame: string): CoachEvent | null {
  let event: string | undefined
  const data: string[] = []
  for (const rawLine of frame.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
  }
  if (!event || data.length === 0) return null
  try {
    const parsed = coachEventSchema.safeParse({ event, data: JSON.parse(data.join('\n')) })
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
