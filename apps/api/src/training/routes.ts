import {
  exerciseHistoryQuerySchema,
  exerciseInputSchema,
  workoutInputSchema,
  workoutsQuerySchema,
  type ExerciseHistoryResponse,
  type ExerciseResponse,
  type ExercisesResponse,
  type WorkoutResponse,
  type WorkoutsResponse,
} from '@diet-tracker/shared'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth } from '../auth/session-middleware.js'
import { errors, validationDetails } from '../errors.js'
import { jsonBody, requireJson } from '../middleware/validate.js'
import type { AppEnv } from '../types.js'
import {
  createExercise,
  deleteExercise,
  exerciseHistory,
  listExercises,
  updateExercise,
} from './exercises-service.js'
import { deleteWorkout, getWorkout, listWorkouts, upsertWorkout } from './workouts-service.js'

const uuid = z.uuid()

/** A malformed id can only be a broken link, so it reads as "not found" rather than 400. */
function idParam(value: string): string {
  const parsed = uuid.safeParse(value)
  if (!parsed.success) throw errors.notFound()
  return parsed.data
}

export const exercisesRoutes = new Hono<AppEnv>()
  /** The catalogue plus the person's own, most recently used first. */
  .get('/', async (c) => {
    const { user } = requireAuth(c)
    const body: ExercisesResponse = { exercises: await listExercises(user.id) }
    return c.json(body, 200)
  })

  .post('/', requireJson, jsonBody(exerciseInputSchema), async (c) => {
    const { user } = requireAuth(c)
    const body: ExerciseResponse = { exercise: await createExercise(user.id, c.req.valid('json')) }
    return c.json(body, 201)
  })

  .patch('/:id', requireJson, jsonBody(exerciseInputSchema), async (c) => {
    const { user } = requireAuth(c)
    const body: ExerciseResponse = {
      exercise: await updateExercise(user.id, idParam(c.req.param('id')), c.req.valid('json')),
    }
    return c.json(body, 200)
  })

  .delete('/:id', async (c) => {
    const { user } = requireAuth(c)
    await deleteExercise(user.id, idParam(c.req.param('id')))
    return c.body(null, 204)
  })

  /** Recent sessions with this exercise, newest first: "last time" on the session screen. */
  .get('/:id/history', async (c) => {
    const { user } = requireAuth(c)
    const query = exerciseHistoryQuerySchema.safeParse(c.req.query())
    if (!query.success) throw errors.validation(validationDetails(query.error))
    const body: ExerciseHistoryResponse = {
      history: await exerciseHistory(user.id, idParam(c.req.param('id')), query.data.limit),
    }
    return c.json(body, 200)
  })

export const workoutsRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const { user } = requireAuth(c)
    const query = workoutsQuerySchema.safeParse(c.req.query())
    if (!query.success) throw errors.validation(validationDetails(query.error))
    const body: WorkoutsResponse = { workouts: await listWorkouts(user.id, query.data) }
    return c.json(body, 200)
  })

  .get('/:id', async (c) => {
    const { user } = requireAuth(c)
    const body: WorkoutResponse = { workout: await getWorkout(user.id, idParam(c.req.param('id'))) }
    return c.json(body, 200)
  })

  /** Creates (201) or replaces (200) the session with this client-minted id (D35). */
  .put('/:id', requireJson, jsonBody(workoutInputSchema), async (c) => {
    const { user } = requireAuth(c)
    const { workout, created } = await upsertWorkout(
      user.id,
      idParam(c.req.param('id')),
      c.req.valid('json'),
    )
    const body: WorkoutResponse = { workout }
    return c.json(body, created ? 201 : 200)
  })

  .delete('/:id', async (c) => {
    const { user } = requireAuth(c)
    await deleteWorkout(user.id, idParam(c.req.param('id')))
    return c.body(null, 204)
  })
