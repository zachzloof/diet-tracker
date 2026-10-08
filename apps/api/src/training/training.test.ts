import {
  MAX_WORKOUTS_RANGE_DAYS,
  RETENTION_DAYS,
  accountExportSchema,
  addDays,
  apiErrorSchema,
  exerciseHistoryResponseSchema,
  exerciseResponseSchema,
  exercisesResponseSchema,
  workoutResponseSchema,
  workoutsResponseSchema,
  type Exercise,
  type ExerciseInput,
  type Workout,
  type WorkoutInput,
  type WorkoutSet,
} from '@diet-tracker/shared'
import { eq, sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { purgeExpiredData } from '../account/retention.js'
import { createApp } from '../app.js'
import { SESSION_COOKIE } from '../auth/session-service.js'
import { db } from '../db/client.js'
import { EXERCISE_CATALOGUE } from '../db/exercise-catalogue.js'
import { exercises, users, workoutExercises, workoutSets, workouts } from '../db/schema/index.js'
import { resetRateLimits } from '../middleware/rate-limit.js'
import { ensureExerciseCatalogue } from './exercises-service.js'

const app = createApp()

const DAY = '2026-10-08'
const STARTED = '2026-10-08T17:00:00.000Z'
const ENDED = '2026-10-08T17:48:00.000Z'

const squatId = EXERCISE_CATALOGUE.find((e) => e.name === 'Barbell back squat')?.id ?? ''
const benchId = EXERCISE_CATALOGUE.find((e) => e.name === 'Barbell bench press')?.id ?? ''

let cookie = ''
let userId = ''

function send(method: 'GET' | 'PUT' | 'PATCH' | 'POST' | 'DELETE', path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: {
      cookie,
      'x-forwarded-for': '203.0.113.9',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

async function register(email: string): Promise<{ cookie: string; id: string }> {
  const res = await app.request('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
    body: JSON.stringify({ email, password: 'finn-password' }),
  })
  const body = (await res.json()) as { user: { id: string } }
  const c =
    res.headers
      .getSetCookie()
      .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
      ?.split(';')[0] ?? ''
  return { cookie: c, id: body.user.id }
}

function set(partial: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id: uuidv7(),
    weightKg: 100,
    reps: 5,
    durationS: null,
    distanceM: null,
    rpe: null,
    isWarmup: false,
    completed: true,
    ...partial,
  }
}

function pushDay(overrides: Partial<WorkoutInput> = {}): WorkoutInput {
  return {
    day: DAY,
    startedAt: STARTED,
    endedAt: ENDED,
    title: 'Push A',
    notes: '',
    feel: 4,
    exercises: [
      {
        id: uuidv7(),
        exerciseId: squatId,
        exerciseName: 'Barbell back squat',
        notes: 'belt on',
        sets: [
          set({ weightKg: 60, isWarmup: true }),
          set(),
          set(),
          set({ weightKg: 102.5, reps: 3 }),
        ],
      },
      {
        id: uuidv7(),
        exerciseId: benchId,
        exerciseName: 'Barbell bench press',
        notes: '',
        sets: [set({ weightKg: 80, reps: 8 }), set({ weightKg: 80, reps: 8 })],
      },
    ],
    ...overrides,
  }
}

async function putWorkout(id: string, input: WorkoutInput, expected = 201): Promise<Workout> {
  const res = await send('PUT', `/api/v1/workouts/${id}`, input)
  expect(res.status).toBe(expected)
  return workoutResponseSchema.parse(await res.json()).workout
}

async function listExercises(): Promise<Exercise[]> {
  const res = await send('GET', '/api/v1/exercises')
  expect(res.status).toBe(200)
  return exercisesResponseSchema.parse(await res.json()).exercises
}

const pistol: ExerciseInput = {
  name: 'Pistol squat',
  kind: 'bodyweight',
  muscleGroups: ['quads', 'glutes'],
  measures: ['reps'],
}

async function addExercise(input: ExerciseInput): Promise<Exercise> {
  const res = await send('POST', '/api/v1/exercises', input)
  expect(res.status).toBe(201)
  return exerciseResponseSchema.parse(await res.json()).exercise
}

beforeAll(async () => {
  // The shared setup truncates `users` with cascade, which empties the catalogue too.
  await ensureExerciseCatalogue()
})

beforeEach(async () => {
  resetRateLimits()
  await db.execute(sql`truncate table workouts, users cascade`)
  await ensureExerciseCatalogue()
  const me = await register('finn@example.com')
  cookie = me.cookie
  userId = me.id
})

describe('GET /api/v1/exercises', () => {
  it('lists the shared catalogue by name, none of it custom', async () => {
    const list = await listExercises()
    expect(list).toHaveLength(EXERCISE_CATALOGUE.length)
    expect(list.every((e) => !e.custom && e.lastUsedAt === null)).toBe(true)
    const names = list.map((e) => e.name.toLowerCase())
    expect(names).toEqual([...names].sort())
    expect(list.find((e) => e.id === squatId)).toMatchObject({
      kind: 'barbell',
      muscleGroups: ['quads', 'glutes'],
      measures: ['weight', 'reps'],
    })
  })

  it('puts the exercises used most recently first once there are sessions', async () => {
    await putWorkout(uuidv7(), pushDay())
    const list = await listExercises()
    expect(list[0]?.name).toBe('Barbell back squat')
    expect(list[1]?.name).toBe('Barbell bench press')
    expect(list[0]?.lastUsedAt).toBe(STARTED)
    expect(list[2]?.lastUsedAt).toBeNull()
  })
})

describe('custom exercises', () => {
  it("creates, renames and deletes the person's own, never the catalogue", async () => {
    const created = await addExercise(pistol)
    expect(created).toMatchObject({ ...pistol, custom: true })
    expect((await listExercises()).some((e) => e.id === created.id)).toBe(true)

    const renamed = await send('PATCH', `/api/v1/exercises/${created.id}`, {
      ...pistol,
      name: 'Pistol squat (box)',
    })
    expect(renamed.status).toBe(200)
    expect(exerciseResponseSchema.parse(await renamed.json()).exercise.name).toBe(
      'Pistol squat (box)',
    )

    expect((await send('PATCH', `/api/v1/exercises/${squatId}`, pistol)).status).toBe(404)
    expect((await send('DELETE', `/api/v1/exercises/${squatId}`)).status).toBe(404)
    expect((await send('DELETE', `/api/v1/exercises/${created.id}`)).status).toBe(204)
    expect((await listExercises()).some((e) => e.id === created.id)).toBe(false)
  })

  it('refuses a blank name and an empty measures list', async () => {
    const res = await send('POST', '/api/v1/exercises', { ...pistol, name: '  ', measures: [] })
    expect(res.status).toBe(400)
    const error = apiErrorSchema.parse(await res.json()).error
    expect(error.code).toBe('validation_error')
  })

  it('is invisible to other people', async () => {
    const created = await addExercise(pistol)
    cookie = (await register('tess@example.com')).cookie
    expect((await listExercises()).some((e) => e.id === created.id)).toBe(false)
    expect((await send('DELETE', `/api/v1/exercises/${created.id}`)).status).toBe(404)
  })
})

describe('PUT /api/v1/workouts/:id', () => {
  it('creates the session with its blocks and sets in order, then replaces it', async () => {
    const id = uuidv7()
    const input = pushDay()
    const created = await putWorkout(id, input)
    expect(created).toMatchObject({ id, day: DAY, title: 'Push A', feel: 4, endedAt: ENDED })
    expect(created.exercises.map((b) => b.exerciseName)).toEqual([
      'Barbell back squat',
      'Barbell bench press',
    ])
    expect(created.exercises[0]?.sets).toEqual(input.exercises[0]?.sets)
    expect(created.exercises[0]?.notes).toBe('belt on')

    const fetched = await send('GET', `/api/v1/workouts/${id}`)
    expect(fetched.status).toBe(200)
    expect(workoutResponseSchema.parse(await fetched.json()).workout).toEqual(created)

    // Drop the bench and the last squat set, add a note: the document is replaced wholesale.
    const squat = input.exercises[0]
    if (!squat) throw new Error('fixture')
    const replaced = await putWorkout(
      id,
      { ...input, notes: 'cut short', exercises: [{ ...squat, sets: squat.sets.slice(0, 3) }] },
      200,
    )
    expect(replaced.notes).toBe('cut short')
    expect(replaced.exercises).toHaveLength(1)
    expect(replaced.exercises[0]?.sets).toHaveLength(3)
    expect(replaced.createdAt).toBe(created.createdAt)
    expect(await db.select().from(workoutExercises)).toHaveLength(1)
    expect(await db.select().from(workoutSets)).toHaveLength(3)
  })

  it('names an untitled session "Workout" and keeps an unusable exercise id as a name-only block', async () => {
    const stranger = await register('tess@example.com')
    const theirs = await db
      .insert(exercises)
      .values({
        id: uuidv7(),
        userId: stranger.id,
        name: 'Secret lift',
        kind: 'other',
        muscleGroups: [],
        measures: ['reps'],
      })
      .returning()
    const block = {
      id: uuidv7(),
      exerciseId: theirs[0]?.id ?? null,
      exerciseName: 'Secret lift',
      notes: '',
      sets: [set({ weightKg: null, reps: 10 })],
    }
    const saved = await putWorkout(uuidv7(), pushDay({ title: '', exercises: [block] }))
    expect(saved.title).toBe('Workout')
    expect(saved.exercises[0]).toMatchObject({ exerciseId: null, exerciseName: 'Secret lift' })
  })

  it("treats another person's session id as not found, and a malformed one too", async () => {
    const id = uuidv7()
    await putWorkout(id, pushDay())
    cookie = (await register('tess@example.com')).cookie
    expect((await send('PUT', `/api/v1/workouts/${id}`, pushDay())).status).toBe(404)
    expect((await send('GET', `/api/v1/workouts/${id}`)).status).toBe(404)
    expect((await send('DELETE', `/api/v1/workouts/${id}`)).status).toBe(404)
    expect((await send('GET', '/api/v1/workouts/not-a-uuid')).status).toBe(404)
  })

  it('validates the document', async () => {
    const bad = pushDay()
    const block = bad.exercises[0]
    if (block) block.sets[0] = set({ weightKg: -5, reps: 2.5 })
    const res = await send('PUT', `/api/v1/workouts/${uuidv7()}`, bad)
    expect(res.status).toBe(400)
    const error = apiErrorSchema.parse(await res.json()).error
    expect(error.code).toBe('validation_error')
    expect(await db.select().from(workouts)).toHaveLength(0)
  })
})

describe('GET /api/v1/workouts', () => {
  it('lists sessions in a range of days, newest first, and caps the range', async () => {
    await putWorkout(uuidv7(), pushDay())
    await putWorkout(
      uuidv7(),
      pushDay({ day: addDays(DAY, -2), startedAt: '2026-10-06T07:00:00.000Z', title: 'Pull' }),
    )
    await putWorkout(
      uuidv7(),
      pushDay({ day: addDays(DAY, -40), startedAt: '2026-08-29T07:00:00.000Z', title: 'Old' }),
    )

    const res = await send('GET', `/api/v1/workouts?from=${addDays(DAY, -6)}&to=${DAY}`)
    expect(res.status).toBe(200)
    const { workouts: list } = workoutsResponseSchema.parse(await res.json())
    expect(list.map((w) => w.title)).toEqual(['Push A', 'Pull'])
    expect(list[0]?.exercises).toHaveLength(2)

    const wide = await send(
      'GET',
      `/api/v1/workouts?from=${addDays(DAY, -MAX_WORKOUTS_RANGE_DAYS)}&to=${DAY}`,
    )
    expect(wide.status).toBe(400)
    const backwards = await send('GET', `/api/v1/workouts?from=${DAY}&to=${addDays(DAY, -1)}`)
    expect(backwards.status).toBe(400)
    expect((await send('GET', '/api/v1/workouts?from=2026-10-01')).status).toBe(400)
  })
})

describe('GET /api/v1/exercises/:id/history', () => {
  it('returns recent sessions with the exercise, newest first, with their sets', async () => {
    await putWorkout(
      uuidv7(),
      pushDay({ day: addDays(DAY, -7), startedAt: '2026-10-01T17:00:00.000Z', title: 'Last week' }),
    )
    const today = await putWorkout(uuidv7(), pushDay())

    const res = await send('GET', `/api/v1/exercises/${squatId}/history?limit=1`)
    expect(res.status).toBe(200)
    const { history } = exerciseHistoryResponseSchema.parse(await res.json())
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ workoutId: today.id, day: DAY, title: 'Push A' })
    expect(history[0]?.sets).toEqual(today.exercises[0]?.sets)

    const all = exerciseHistoryResponseSchema.parse(
      await (await send('GET', `/api/v1/exercises/${squatId}/history`)).json(),
    )
    expect(all.history.map((h) => h.title)).toEqual(['Push A', 'Last week'])
    expect((await send('GET', `/api/v1/exercises/${squatId}/history?limit=0`)).status).toBe(400)

    const none = exerciseHistoryResponseSchema.parse(
      await (await send('GET', `/api/v1/exercises/${benchId}/history`)).json(),
    )
    expect(none.history).toHaveLength(2)
    const never = exerciseHistoryResponseSchema.parse(
      await (await send('GET', `/api/v1/exercises/${uuidv7()}/history`)).json(),
    )
    expect(never.history).toEqual([])
  })
})

describe('deleting', () => {
  it('removes a session with its rows', async () => {
    const id = uuidv7()
    await putWorkout(id, pushDay())
    expect((await send('DELETE', `/api/v1/workouts/${id}`)).status).toBe(204)
    expect((await send('GET', `/api/v1/workouts/${id}`)).status).toBe(404)
    expect(await db.select().from(workoutExercises)).toHaveLength(0)
    expect(await db.select().from(workoutSets)).toHaveLength(0)
  })

  it('keeps a session readable after its custom exercise is deleted', async () => {
    const created = await addExercise(pistol)
    const id = uuidv7()
    await putWorkout(
      id,
      pushDay({
        exercises: [
          {
            id: uuidv7(),
            exerciseId: created.id,
            exerciseName: created.name,
            notes: '',
            sets: [set({ weightKg: null, reps: 8 })],
          },
        ],
      }),
    )
    expect((await send('DELETE', `/api/v1/exercises/${created.id}`)).status).toBe(204)
    const after = workoutResponseSchema.parse(
      await (await send('GET', `/api/v1/workouts/${id}`)).json(),
    ).workout
    expect(after.exercises[0]).toMatchObject({ exerciseId: null, exerciseName: 'Pistol squat' })
    expect(after.exercises[0]?.sets[0]?.reps).toBe(8)
  })

  it('cascades from the account and leaves the catalogue alone', async () => {
    await addExercise(pistol)
    await putWorkout(uuidv7(), pushDay())
    await db.delete(users).where(eq(users.id, userId))
    expect(await db.select().from(workouts)).toHaveLength(0)
    expect(await db.select().from(workoutExercises)).toHaveLength(0)
    expect(await db.select().from(workoutSets)).toHaveLength(0)
    expect(await db.select().from(exercises)).toHaveLength(EXERCISE_CATALOGUE.length)
  })
})

describe('retention and export', () => {
  it('keeps workouts past the six-month purge (D36)', async () => {
    const old = addDays(DAY, -(RETENTION_DAYS + 30))
    await putWorkout(uuidv7(), pushDay({ day: old, startedAt: `${old}T07:00:00.000Z` }))
    await purgeExpiredData(new Date(`${DAY}T12:00:00.000Z`))
    expect(await db.select().from(workouts)).toHaveLength(1)
  })

  it("includes the person's sessions and custom exercises in the export", async () => {
    const created = await addExercise(pistol)
    const saved = await putWorkout(uuidv7(), pushDay())
    const res = await send('GET', '/api/v1/account/export/json')
    expect(res.status).toBe(200)
    const data = accountExportSchema.parse(await res.json())
    expect(data.app.schema).toBe(3)
    expect(data.exercises).toEqual([created])
    expect(data.workouts).toEqual([saved])
  })
})
