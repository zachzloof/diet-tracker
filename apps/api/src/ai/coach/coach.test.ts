import {
  COACH_MAX_MESSAGE_CHARS,
  COACH_MAX_TOOL_ROUNDS,
  COACH_MAX_TURNS,
  COACH_UNAVAILABLE_TEXT,
  accountExportSchema,
  addDays,
  apiErrorSchema,
  coachEventSchema,
  coachThreadResponseSchema,
  coachThreadsResponseSchema,
  coachTurnResponseSchema,
  localDay,
  portionOf,
  summariseTarget,
  type CoachEvent,
  type Profile,
  type ProfileInput,
} from '@diet-tracker/shared'
import { eq, sql } from 'drizzle-orm'
import type * as Responses from 'openai/resources/responses/responses'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { SESSION_COOKIE } from '../../auth/session-service.js'
import { db } from '../../db/client.js'
import { aiCalls, coachMessages, coachThreads } from '../../db/schema/index.js'
import { SEED_FOODS, SEED_USERS } from '../../db/seed-data.js'
import { seedWeights } from '../../db/seed-progress.js'
import { seedWorkouts } from '../../db/seed-training.js'
import { seedWeek } from '../../db/seed-weeks.js'
import { env } from '../../env.js'
import { createFood, listFoods } from '../../log/foods-service.js'
import { createSavedMeal } from '../../log/saved-meals-service.js'
import { resetRateLimits } from '../../middleware/rate-limit.js'
import { getProfile } from '../../profile/profile-service.js'
import { weekStats } from '../../stats/stats-service.js'
import { ensureExerciseCatalogue } from '../../training/exercises-service.js'
import { listWorkouts } from '../../training/workouts-service.js'
import { coachModel, replayHistory, runTurn, type CoachModelClient } from './agent.js'
import { buildBriefing, loadBriefingInputs } from './briefing.js'
import { createThread } from './threads-service.js'
import { COACH_TOOLS, toolByName, type ToolContext } from './tools/index.js'

/**
 * The coach against real Postgres (slice 11a): the briefing against the seeded weeks, every
 * read tool including the cross-user scoping check, the tool loop with a scripted model,
 * and the routes (JSON and server-sent events). The model is never called: `coachModel`
 * holds a fake that plays a script of rounds.
 */

const app = createApp()
const TZ = 'Europe/London'
const IP = '203.0.113.9'
const finn = SEED_USERS.find((u) => u.email === 'finn@example.com')!
const tess = SEED_USERS.find((u) => u.email === 'tess@example.com')!

interface Account {
  cookie: string
  id: string
  profile: Profile
}

async function send(
  cookie: string,
  method: 'GET' | 'POST' | 'DELETE',
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

async function signUp(email: string, profile: ProfileInput): Promise<Account> {
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

async function seedAll(account: Account, email: string): Promise<void> {
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

type Round =
  | { text: string }
  | { calls: { name: string; arguments: string }[] }
  | { fail: string }
  | { throw: Error }

interface Fake extends CoachModelClient {
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

function scripted(rounds: Round[]): Fake {
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

function collect(): { events: CoachEvent[]; emit: (event: CoachEvent) => void } {
  const events: CoachEvent[] = []
  return { events, emit: (event) => void events.push(event) }
}

/** Reads a `text/event-stream` body into typed events. */
async function readSse(res: Response): Promise<CoachEvent[]> {
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

let finnAccount: Account
let tessAccount: Account
const today = () => localDay(new Date(), TZ)
const ctxFor = (account: Account): ToolContext => ({
  userId: account.id,
  profile: account.profile,
  now: new Date(),
  today: today(),
})
const run = (name: string, ctx: ToolContext, args: unknown) => {
  const tool = toolByName(name)
  if (!tool) throw new Error(`no tool ${name}`)
  return tool.run(ctx, tool.schema.parse(args) as never)
}

beforeEach(async () => {
  resetRateLimits()
  await db.execute(
    sql`truncate table coach_messages, coach_threads, workouts, weekly_reviews, log_entries, daily_summaries, foods, ai_calls, weight_entries, target_versions, profiles, sessions, users cascade`,
  )
  await ensureExerciseCatalogue()
  finnAccount = await signUp(finn.email, finn.profile)
  tessAccount = await signUp(tess.email, tess.profile)
  await seedAll(finnAccount, finn.email)
  await seedAll(tessAccount, tess.email)
  // The route checks for a key before it stores anything; the fake model never uses it.
  env.OPENAI_API_KEY = 'test-only-key'
  env.AI_COACH_DAILY_TURN_CAP = 60
  coachModel.override = scripted([{ text: 'Hello.' }])
})

afterEach(() => {
  coachModel.override = null
  env.OPENAI_API_KEY = ''
})

describe('the briefing', () => {
  it("quotes Finn's week as the Week screen shows it, and his squat gain", async () => {
    const inputs = await loadBriefingInputs(finnAccount.id, finnAccount.profile)
    const briefing = buildBriefing(inputs)
    const week = await weekStats(finnAccount.id, finnAccount.profile, undefined)
    expect(briefing).toContain(`Today is`)
    expect(briefing).toContain(`${today()},`)
    expect(briefing).toContain(
      `Days logged: ${week.daysLogged} of 7. Days met: ${week.daysMet}. Streak: ${week.streak}`,
    )
    const energy = summariseTarget(week.days, 'energy_kcal')
    const protein = summariseTarget(week.days, 'protein_g')
    expect(briefing).toContain(
      `Energy: ${Math.round(energy.average!)} / ${Math.round(energy.target!)} kcal`,
    )
    expect(briefing).toContain(
      `Protein: ${Math.round(protein.average!)} / ${Math.round(protein.target!)} g`,
    )
    for (const gap of week.gaps) expect(briefing).toContain(gap.evidence)
    expect(briefing).toContain(
      'Male, 28, 178 cm, 75 kg. Goal: gain muscle, lean gain pace, goal weight 80 kg.',
    )
    expect(briefing).toContain('Dislikes: liver')
    expect(briefing).toContain('Sessions: 3 of 6 planned')
    // The biggest relative gain leads, as the gym Week card ranks them.
    expect(briefing).toContain(
      'Biggest gain: Overhead press: 400 kg lifted (50 kg × 8), from 380 kg lifted (47.5 kg × 8) last week, +20 (+5%)',
    )
    expect(briefing).toContain('Latest: 75.1 kg')
    expect(briefing).toContain('PLAN CHECK')
    expect(briefing).not.toContain('undefined')
    expect(briefing).not.toContain('NaN')
  })

  it("carries Tess's allergy, the loss goal and the plan check proposal", async () => {
    const briefing = buildBriefing(await loadBriefingInputs(tessAccount.id, tessAccount.profile))
    expect(briefing).toContain('Female, 30, 160 cm, 50 kg. Goal: lose fat, gentle pace')
    expect(briefing).toContain('Allergies or intolerances: shellfish. Dislikes: coriander.')
    expect(briefing).toContain('added sugar is not more than 5% over the limit')
    expect(briefing).toContain('Sessions: 1 of 3 planned')
  })

  it('leaves the gym out when workouts are switched off', async () => {
    const profile: Profile = {
      ...finnAccount.profile,
      preferences: { ...finnAccount.profile.preferences, workouts: false },
    }
    const briefing = buildBriefing(await loadBriefingInputs(finnAccount.id, profile))
    expect(briefing).not.toContain('GYM THIS WEEK')
    expect(briefing).toContain('Switched off in Preferences: the gym')
  })
})

describe('the read tools', () => {
  it('get_day_food lists yesterday by meal and reports an empty day honestly', async () => {
    const ctx = ctxFor(finnAccount)
    const yesterday = addDays(today(), -1)
    const result = (await run('get_day_food', ctx, { day: yesterday })) as {
      label: string
      entries: number
      meals: { meal: string; items: { kcal: number }[] }[]
      totals: { target: string; actual: number }[]
      day_met: boolean
    }
    expect(result.label).toBe('yesterday')
    expect(result.entries).toBeGreaterThan(0)
    expect(result.meals.length).toBeGreaterThan(0)
    expect(result.totals.find((t) => t.target === 'Energy')?.actual).toBeGreaterThan(0)

    const empty = await run('get_day_food', ctx, { day: addDays(today(), -40) })
    expect(empty).toMatchObject({ empty: true })
    const future = await run('get_day_food', ctx, { day: addDays(today(), 1) })
    expect(future).toMatchObject({ empty: true })
  })

  it("get_lift_history matches the lift page: best 525, latest 525, +25 kg over Finn's squats", async () => {
    const result = (await run('get_lift_history', ctxFor(finnAccount), {
      exercise_id: null,
      exercise_name: 'squat',
      sessions: null,
    })) as {
      exercise: string
      best: { value: string; set: string }
      latest: { value: string; set: string }
      trend: { change: string; change_pct: string; sessions_compared: number }
      sessions: { value: string | null }[]
    }
    expect(result.exercise).toBe('Barbell back squat')
    expect(result.best).toMatchObject({ value: '525 kg lifted', set: '105 kg × 5' })
    expect(result.latest).toMatchObject({ value: '525 kg lifted', set: '105 kg × 5' })
    expect(result.trend).toMatchObject({
      change: '+25 kg lifted',
      change_pct: '5%',
      sessions_compared: 3,
    })
    expect(result.sessions.map((s) => s.value)).toEqual([
      '500 kg lifted',
      '512.5 kg lifted',
      '525 kg lifted',
    ])
  })

  it('get_week_food, get_month_food, get_targets and get_gym_week agree with the services', async () => {
    const ctx = ctxFor(finnAccount)
    const week = await weekStats(finnAccount.id, finnAccount.profile, undefined)
    const weekResult = (await run('get_week_food', ctx, { week_end: null })) as {
      days_met: number
      days_logged: number
      gaps: { title: string }[]
    }
    expect(weekResult.days_met).toBe(week.daysMet)
    expect(weekResult.days_logged).toBe(week.daysLogged)
    expect(weekResult.gaps.map((g) => g.title)).toEqual(week.gaps.map((g) => g.title))

    const month = (await run('get_month_food', ctx, { month: null })) as { days_logged: number }
    expect(month.days_logged).toBeGreaterThan(0)

    const targets = (await run('get_targets', ctx, {})) as {
      targets: { target: string; value: string; unit: string }[]
      history: unknown[]
    }
    expect(targets.targets.find((t) => t.target === 'Energy')).toMatchObject({ unit: 'kcal' })
    expect(targets.history.length).toBe(1)

    const gym = (await run('get_gym_week', ctx, { week_end: null })) as {
      sessions: number
      week_on_week: { lifts: { exercise: string; change: string }[] }
    }
    expect(gym.sessions).toBe(3)
    expect(gym.week_on_week.lifts.find((l) => l.exercise === 'Barbell back squat')).toMatchObject({
      change: '+12.5 kg lifted',
    })
  })

  it('get_workout, get_weight_history, get_recalibration and get_weekly_review', async () => {
    const ctx = ctxFor(finnAccount)
    const sessions = await listWorkouts(finnAccount.id, { from: addDays(today(), -6), to: today() })
    const byId = (await run('get_workout', ctx, { id: sessions[0]!.id, day: null })) as {
      sessions: { title: string; exercises: { sets: { set: string }[] }[] }[]
    }
    expect(byId.sessions[0]!.exercises[0]!.sets[0]!.set).toMatch(/kg × /)
    const byDay = await run('get_workout', ctx, { id: null, day: sessions[0]!.day })
    expect(byDay).toMatchObject({ sessions: [{ title: sessions[0]!.title }] })
    expect(await run('get_workout', ctx, { id: null, day: addDays(today(), -1) })).toMatchObject({
      empty: true,
    })

    const weight = (await run('get_weight_history', ctx, { days: null })) as {
      latest: { kg: string }
      weigh_ins: number
    }
    expect(weight.latest.kg).toBe('75.1')
    expect(weight.weigh_ins).toBe(8)

    const recal = (await run('get_recalibration', ctx, {})) as { status: string }
    expect(['on_track', 'proposal', 'not_enough_data', 'not_due']).toContain(recal.status)

    expect(await run('get_weekly_review', ctx, { week_end: null })).toMatchObject({ empty: true })
  })

  it('search_my_foods, search_meals and list_exercises', async () => {
    const ctx = ctxFor(finnAccount)
    const foods = (await run('search_my_foods', ctx, { query: 'whey' })) as {
      foods: { name: string; kcal: number }[]
    }
    expect(foods.foods[0]).toMatchObject({ name: 'Whey protein shake', kcal: 130 })
    expect(await run('search_my_foods', ctx, { query: 'zzz' })).toMatchObject({ empty: true })

    const meals = (await run('search_meals', ctx, { query: '' })) as { meals: { name: string }[] }
    expect(meals.meals.map((m) => m.name)).toEqual(['Protein oats'])

    const exercises = (await run('list_exercises', ctx, {
      query: 'squat',
      muscle_group: null,
    })) as {
      exercises: { name: string; last_used: string | null }[]
    }
    expect(exercises.exercises[0]).toMatchObject({ name: 'Barbell back squat' })
    expect(exercises.exercises[0]!.last_used).not.toBeNull()
  })

  it("never shows one person another's data", async () => {
    const finnSessions = await listWorkouts(finnAccount.id, {
      from: addDays(today(), -6),
      to: today(),
    })
    const ctx = ctxFor(tessAccount)
    expect(await run('get_workout', ctx, { id: finnSessions[0]!.id, day: null })).toMatchObject({
      empty: true,
    })
    const lift = (await run('get_lift_history', ctx, {
      exercise_id: null,
      exercise_name: 'back squat',
      sessions: null,
    })) as { empty?: boolean; exercise?: string }
    expect(lift.empty).toBe(true)
    const foods = await run('search_my_foods', ctx, { query: 'whey' })
    expect(foods).toMatchObject({ empty: true })
  })

  it('every tool has a strict schema and a status line', () => {
    for (const tool of COACH_TOOLS) {
      expect(tool.description.length).toBeGreaterThan(20)
      expect(typeof tool.status).toBe('function')
    }
  })
})

describe('the tool loop', () => {
  const base = () => ({
    userId: finnAccount.id,
    profile: finnAccount.profile,
    history: [],
    now: new Date(),
  })

  it('streams a status line for the tool, then the answer, and logs every round', async () => {
    const fake = scripted([
      {
        calls: [
          {
            name: 'get_lift_history',
            arguments: JSON.stringify({ exercise_id: null, exercise_name: 'squat', sessions: 5 }),
          },
        ],
      },
      { text: 'Yes: your best squat set is 525 kg lifted, up 25 kg.' },
    ])
    const { events, emit } = collect()
    const result = await runTurn({
      ...base(),
      text: 'Am I getting stronger on squat?',
      emit,
      model: fake,
    })
    expect(result.error).toBeNull()
    expect(result.text).toBe('Yes: your best squat set is 525 kg lifted, up 25 kg.')
    expect(events[0]).toEqual({
      event: 'status',
      data: { tool: 'get_lift_history', text: 'Looking at your last 5 squat sessions' },
    })
    expect(events.slice(1).every((e) => e.event === 'delta')).toBe(true)
    expect(
      events
        .slice(1)
        .map((e) => (e.event === 'delta' ? e.data.text : ''))
        .join(''),
    ).toBe(result.text)
    expect(result.toolTrail).toEqual([
      expect.objectContaining({
        name: 'get_lift_history',
        ok: true,
        summary: 'Looking at your last 5 squat sessions',
      }),
    ])
    expect(result.aiCallIds).toHaveLength(2)
    const rows = await db.select().from(aiCalls).where(eq(aiCalls.purpose, 'coach'))
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.ok && r.inputTokens === 1200)).toBe(true)
    // The second round carries the call and its output.
    const second = fake.params[1]!.input as Responses.ResponseInputItem[]
    expect(second.some((i) => 'type' in i && i.type === 'function_call')).toBe(true)
    const output = second.find((i) => 'type' in i && i.type === 'function_call_output') as
      Responses.ResponseInputItem.FunctionCallOutput | undefined
    expect(output?.output).toContain('525 kg lifted')
    // The first round has the system prompt with the briefing, then the question.
    const first = fake.params[0]!
    expect(JSON.stringify(first.input)).toContain('BRIEFING')
    expect(first.tool_choice).toBe('auto')
    expect(first.tools).toHaveLength(COACH_TOOLS.length)
  })

  it('runs parallel calls, returns bad arguments to the model, and stops at the round cap', async () => {
    const rounds: Round[] = []
    for (let i = 0; i < COACH_MAX_TOOL_ROUNDS; i++) {
      rounds.push({
        calls: [
          { name: 'get_targets', arguments: '{}' },
          { name: 'get_day_food', arguments: JSON.stringify({ day: 'not-a-day' }) },
          { name: 'no_such_tool', arguments: '{}' },
        ],
      })
    }
    rounds.push({ text: 'Here is what I have.' })
    const fake = scripted(rounds)
    const { emit } = collect()
    const result = await runTurn({ ...base(), text: 'Everything', emit, model: fake })
    expect(result.error).toBeNull()
    expect(result.text).toBe('Here is what I have.')
    expect(fake.params).toHaveLength(COACH_MAX_TOOL_ROUNDS + 1)
    const last = fake.params[COACH_MAX_TOOL_ROUNDS]!
    expect(last.tool_choice).toBe('none')
    expect(last.tools).toEqual([])
    expect(JSON.stringify(last.input)).toContain('used every tool call')
    const second = fake.params[1]!.input as Responses.ResponseInputItem[]
    const outputs = second.filter(
      (i): i is Responses.ResponseInputItem.FunctionCallOutput =>
        'type' in i && i.type === 'function_call_output',
    )
    expect(outputs).toHaveLength(3)
    expect(outputs[1]!.output).toContain('arguments rejected')
    expect(outputs[2]!.output).toContain('no tool called no_such_tool')
    expect(result.toolTrail.filter((t) => t.ok)).toHaveLength(COACH_MAX_TOOL_ROUNDS)
  })

  it('answers with the failure copy and keeps the trail when the model fails', async () => {
    const fake = scripted([{ fail: 'boom' }])
    const result = await runTurn({ ...base(), text: 'Hi', emit: () => undefined, model: fake })
    expect(result.error).toContain('boom')
    expect(result.text).toBe(COACH_UNAVAILABLE_TEXT)
    const rows = await db.select().from(aiCalls).where(eq(aiCalls.purpose, 'coach'))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.ok).toBe(false)
  })

  it('replays earlier turns as messages, older ones shortened', () => {
    const long = 'x'.repeat(400)
    const history = Array.from({ length: 30 }, (_, i) => ({
      id: `00000000-0000-7000-8000-${String(i).padStart(12, '0')}`,
      threadId: '00000000-0000-7000-8000-000000000999',
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      text: i === 0 ? long : `m${i}`,
      cards: [],
      toolTrail: [],
      error: i === 3 ? 'failed' : null,
      createdAt: new Date().toISOString(),
    }))
    const replayed = replayHistory(history)
    expect(replayed).toHaveLength(29)
    expect((replayed[0] as { content: string }).content.length).toBeLessThan(200)
    expect((replayed[28] as { content: string }).content).toBe('m29')
  })
})

describe('/api/v1/coach', () => {
  it('creates a thread, answers as events, lists, reopens and deletes', async () => {
    const { cookie } = finnAccount
    coachModel.override = scripted([
      { calls: [{ name: 'get_targets', arguments: '{}' }] },
      { text: 'Your energy target is set by the engine.' },
    ])
    const created = await send(cookie, 'POST', '/api/v1/coach/threads')
    expect(created.status).toBe(201)
    const { thread } = (await created.json()) as { thread: { id: string } }

    const res = await send(cookie, 'POST', `/api/v1/coach/threads/${thread.id}/messages`, {
      text: 'Why is my fat target 80 g?',
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const events = await readSse(res)
    expect(events[0]).toMatchObject({ event: 'status', data: { tool: 'get_targets' } })
    expect(events.filter((e) => e.event === 'delta').length).toBeGreaterThan(1)
    const done = events[events.length - 1]!
    expect(done.event).toBe('done')
    if (done.event !== 'done') throw new Error('unreachable')
    expect(done.data.thread).toMatchObject({ turns: 1, title: 'Why is my fat target 80 g?' })
    expect(done.data.user).toMatchObject({ role: 'user', text: 'Why is my fat target 80 g?' })
    expect(done.data.assistant).toMatchObject({
      role: 'assistant',
      text: 'Your energy target is set by the engine.',
      error: null,
    })
    expect(done.data.assistant.toolTrail).toEqual([
      expect.objectContaining({ name: 'get_targets', summary: 'Checking your targets' }),
    ])

    const list = coachThreadsResponseSchema.parse(
      await (await send(cookie, 'GET', '/api/v1/coach/threads')).json(),
    )
    expect(list.threads.map((t) => t.id)).toEqual([thread.id])

    const opened = coachThreadResponseSchema.parse(
      await (await send(cookie, 'GET', `/api/v1/coach/threads/${thread.id}`)).json(),
    )
    expect(opened.messages.map((m) => m.role)).toEqual(['user', 'assistant'])

    // Another person cannot see or delete it.
    expect(
      (await send(tessAccount.cookie, 'GET', `/api/v1/coach/threads/${thread.id}`)).status,
    ).toBe(404)
    expect(
      (await send(tessAccount.cookie, 'DELETE', `/api/v1/coach/threads/${thread.id}`)).status,
    ).toBe(404)

    expect((await send(cookie, 'DELETE', `/api/v1/coach/threads/${thread.id}`)).status).toBe(204)
    expect((await send(cookie, 'GET', `/api/v1/coach/threads/${thread.id}`)).status).toBe(404)
    expect(await db.select().from(coachMessages)).toHaveLength(0)
  })

  it('answers as JSON with ?stream=false and replays the thread on the next turn', async () => {
    const { cookie } = finnAccount
    const fake = scripted([{ text: 'First answer.' }, { text: 'Second answer.' }])
    coachModel.override = fake
    const thread = await createThread(finnAccount.id)
    const first = await send(
      cookie,
      'POST',
      `/api/v1/coach/threads/${thread.id}/messages?stream=false`,
      {
        text: 'How am I doing this week?',
      },
    )
    expect(first.status).toBe(200)
    const body = coachTurnResponseSchema.parse(await first.json())
    expect(body.assistant.text).toBe('First answer.')
    expect(body.thread.turns).toBe(1)
    const second = await send(
      cookie,
      'POST',
      `/api/v1/coach/threads/${thread.id}/messages?stream=false`,
      {
        text: 'And protein?',
      },
    )
    expect(second.status).toBe(200)
    const input = fake.params[1]!.input as { role?: string; content?: string }[]
    expect(input.map((i) => i.content).slice(1)).toEqual([
      'How am I doing this week?',
      'First answer.',
      'And protein?',
    ])
  })

  it('rejects a long message before any call, caps turns per day and per thread', async () => {
    const { cookie } = finnAccount
    const thread = await createThread(finnAccount.id)
    const long = await send(cookie, 'POST', `/api/v1/coach/threads/${thread.id}/messages`, {
      text: 'x'.repeat(COACH_MAX_MESSAGE_CHARS + 1),
    })
    expect(long.status).toBe(400)
    expect(apiErrorSchema.parse(await long.json()).error.code).toBe('validation_error')
    expect(await db.select().from(coachMessages)).toHaveLength(0)
    expect(await db.select().from(aiCalls)).toHaveLength(0)

    env.AI_COACH_DAILY_TURN_CAP = 1
    coachModel.override = scripted([{ text: 'One.' }])
    expect(
      (
        await send(cookie, 'POST', `/api/v1/coach/threads/${thread.id}/messages?stream=false`, {
          text: 'One',
        })
      ).status,
    ).toBe(200)
    const capped = await send(cookie, 'POST', `/api/v1/coach/threads/${thread.id}/messages`, {
      text: 'Two',
    })
    expect(capped.status).toBe(429)
    const error = apiErrorSchema.parse(await capped.json()).error
    expect(error.code).toBe('ai_cap_reached')
    expect(error.message).toContain('daily limit')
    env.AI_COACH_DAILY_TURN_CAP = 60

    await db
      .update(coachThreads)
      .set({ turns: COACH_MAX_TURNS })
      .where(eq(coachThreads.id, thread.id))
    const full = await send(cookie, 'POST', `/api/v1/coach/threads/${thread.id}/messages`, {
      text: 'Three',
    })
    expect(full.status).toBe(409)
    expect(apiErrorSchema.parse(await full.json()).error.message).toContain('Start a new chat')
  })

  it('keeps the question and stores the failure copy when the model is down', async () => {
    const { cookie } = finnAccount
    coachModel.override = scripted([{ throw: new Error('socket hang up') }])
    const thread = await createThread(finnAccount.id)
    const res = await send(cookie, 'POST', `/api/v1/coach/threads/${thread.id}/messages`, {
      text: 'Hello?',
    })
    const events = await readSse(res)
    const done = events[events.length - 1]!
    expect(done.event).toBe('done')
    if (done.event !== 'done') throw new Error('unreachable')
    expect(done.data.assistant.text).toBe(COACH_UNAVAILABLE_TEXT)
    expect(done.data.assistant.error).toContain('socket hang up')
    const opened = coachThreadResponseSchema.parse(
      await (await send(cookie, 'GET', `/api/v1/coach/threads/${thread.id}`)).json(),
    )
    expect(opened.messages).toHaveLength(2)
  })

  it('answers 503 without a key, and 404 for a malformed or foreign thread id', async () => {
    const { cookie } = finnAccount
    const thread = await createThread(finnAccount.id)
    env.OPENAI_API_KEY = ''
    const res = await send(cookie, 'POST', `/api/v1/coach/threads/${thread.id}/messages`, {
      text: 'Hi',
    })
    expect(res.status).toBe(503)
    expect(apiErrorSchema.parse(await res.json()).error.message).toBe(COACH_UNAVAILABLE_TEXT)
    expect(
      (await send(cookie, 'POST', '/api/v1/coach/threads/nope/messages', { text: 'Hi' })).status,
    ).toBe(404)
  })

  it('exports the threads with the account and deletes them with it', async () => {
    const { cookie } = finnAccount
    coachModel.override = scripted([{ text: 'Kept.' }])
    const thread = await createThread(finnAccount.id)
    await send(cookie, 'POST', `/api/v1/coach/threads/${thread.id}/messages?stream=false`, {
      text: 'Remember this',
    })
    const exported = accountExportSchema.parse(
      await (await send(cookie, 'GET', '/api/v1/account/export/json')).json(),
    )
    expect(exported.coachThreads).toHaveLength(1)
    expect(exported.coachThreads[0]!.messages.map((m) => m.text)).toEqual([
      'Remember this',
      'Kept.',
    ])

    const deleted = await send(cookie, 'DELETE', '/api/v1/account', { password: 'finn-password' })
    expect(deleted.status).toBe(204)
    expect(await db.select().from(coachThreads)).toHaveLength(0)
    expect(await db.select().from(coachMessages)).toHaveLength(0)
  })
})
