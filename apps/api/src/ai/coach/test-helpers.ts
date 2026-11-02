import {
  coachEventSchema,
  portionOf,
  type CoachEvent,
  type Profile,
  type ProfileInput,
} from '@diet-tracker/shared'
import type * as Responses from 'openai/resources/responses/responses'
import { expect } from 'vitest'
import { createApp } from '../../app.js'
import { SESSION_COOKIE } from '../../auth/session-service.js'
import { SEED_FOODS, SEED_USERS } from '../../db/seed-data.js'
import { seedWeights } from '../../db/seed-progress.js'
import { seedWorkouts } from '../../db/seed-training.js'
import { seedWeek } from '../../db/seed-weeks.js'
import { createFood, listFoods } from '../../log/foods-service.js'
import { createSavedMeal } from '../../log/saved-meals-service.js'
import { getProfile } from '../../profile/profile-service.js'
import type { CoachModelClient } from './agent.js'

/**
 * Shared by the coach's test files: the app, two seeded accounts (Finn and Tess with their
 * weeks, weigh-ins, sessions, foods and a meal), a scripted model in place of OpenAI, and
 * an SSE reader. The model is never called in tests.
 */

export const app = createApp()
export const TZ = 'Europe/London'
export const IP = '203.0.113.9'
export const finn = SEED_USERS.find((u) => u.email === 'finn@example.com')!
export const tess = SEED_USERS.find((u) => u.email === 'tess@example.com')!

export interface Account {
  cookie: string
  id: string
  profile: Profile
}

export async function send(
  cookie: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<Response> {
  return await app.request(path, {
    method,
    headers: {
      cookie,
      'x-forwarded-for': IP,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

export async function signUp(email: string, profile: ProfileInput): Promise<Account> {
  const res = await app.request('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': IP },
    body: JSON.stringify({ email, password: 'finn-password' }),
  })
  const body = (await res.json()) as { user: { id: string } }
  const cookie =
    res.headers
      .getSetCookie()
      .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
      ?.split(';')[0] ?? ''
  const saved = await app.request('/api/v1/profile', {
    method: 'PUT',
    headers: { cookie, 'x-forwarded-for': IP, 'content-type': 'application/json' },
    body: JSON.stringify(profile),
  })
  expect(saved.status).toBe(200)
  const stored = await getProfile(body.user.id)
  if (!stored) throw new Error('profile missing after save')
  return { cookie, id: body.user.id, profile: stored }
}

export async function seedAll(account: Account, email: string): Promise<void> {
  await seedWeek(account.id, email, TZ)
  await seedWeights(account.id, email, TZ)
  await seedWorkouts(account.id, email, TZ)
  for (const food of SEED_FOODS[email] ?? []) {
    await createFood(account.id, food, { source: 'manual', verified: true })
  }
  const oats = (await listFoods(account.id, { q: 'oats', limit: 1 }))[0]
  if (oats) {
    await createSavedMeal(account.id, {
      name: email.startsWith('finn') ? 'Protein oats' : 'Banana porridge',
      items: [
        {
          name: oats.name,
          quantity: 80,
          unit: 'g',
          grams: 80,
          nutrients: portionOf(oats, 80).nutrients,
          foodGroups: portionOf(oats, 80).foodGroups,
          foodId: oats.id,
        },
      ],
    })
  }
}

// --- A scripted model ------------------------------------------------------------------------

export type Round =
  | { text: string }
  | { calls: { name: string; arguments: string }[] }
  | { fail: string }
  | { throw: Error }

export interface Fake extends CoachModelClient {
  params: Responses.ResponseCreateParamsStreaming[]
}

let itemCounter = 0

function message(text: string): Responses.ResponseOutputMessage {
  return {
    type: 'message',
    id: `msg_${++itemCounter}`,
    role: 'assistant',
    status: 'completed',
    content: [{ type: 'output_text', text, annotations: [] }],
  }
}

function functionCall(name: string, args: string): Responses.ResponseFunctionToolCall {
  return {
    type: 'function_call',
    id: `fc_${++itemCounter}`,
    call_id: `call_${itemCounter}`,
    name,
    arguments: args,
    status: 'completed',
  }
}

function completed(output: Responses.ResponseOutputItem[]): Responses.ResponseCompletedEvent {
  // Only the fields the agent reads; the SDK type has many more.
  const response = {
    id: `resp_${++itemCounter}`,
    model: 'fake-coach-model',
    status: 'completed',
    output,
    usage: {
      input_tokens: 1200,
      output_tokens: 80,
      total_tokens: 1280,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
  } as unknown as Responses.Response
  return { type: 'response.completed', response, sequence_number: 0 }
}

export function scripted(rounds: Round[]): Fake {
  const queue = [...rounds]
  const fake: Fake = {
    params: [],
    async stream(params) {
      // The agent appends to one input array across rounds, so keep a copy per round.
      fake.params.push({
        ...params,
        input: Array.isArray(params.input) ? [...params.input] : params.input,
      })
      const round = queue.shift()
      if (!round) throw new Error('the script ran out of rounds')
      if ('throw' in round) throw round.throw
      const r: Exclude<Round, { throw: Error }> = round
      async function* events(): AsyncGenerator<Responses.ResponseStreamEvent> {
        if ('fail' in r) {
          yield { type: 'error', code: null, message: r.fail, param: null, sequence_number: 0 }
          return
        }
        if ('text' in r) {
          const item = message(r.text)
          for (const word of r.text.split(/(?<= )/)) {
            yield {
              type: 'response.output_text.delta',
              delta: word,
              item_id: item.id,
              content_index: 0,
              output_index: 0,
              sequence_number: 0,
              logprobs: [],
            }
          }
          yield { type: 'response.output_item.done', item, output_index: 0, sequence_number: 0 }
          yield completed([item])
          return
        }
        const items = r.calls.map((call) => functionCall(call.name, call.arguments))
        for (const [i, item] of items.entries()) {
          yield { type: 'response.output_item.done', item, output_index: i, sequence_number: 0 }
        }
        yield completed(items)
      }
      return events()
    },
  }
  return fake
}

export function collect(): { events: CoachEvent[]; emit: (event: CoachEvent) => void } {
  const events: CoachEvent[] = []
  return { events, emit: (event) => void events.push(event) }
}

/** Reads a `text/event-stream` body into typed events. */
export async function readSse(res: Response): Promise<CoachEvent[]> {
  const text = await res.text()
  return text
    .split('\n\n')
    .filter((frame) => frame.trim().length > 0)
    .map((frame) => {
      const event = /^event: (.+)$/m.exec(frame)?.[1]
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6))
        .join('\n')
      return coachEventSchema.parse({ event, data: JSON.parse(data) })
    })
}
