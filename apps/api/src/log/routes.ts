import {
  createEntriesRequestSchema,
  estimateRequestSchema,
  foodInputSchema,
  foodsQuerySchema,
  isValidDay,
  updateEntryRequestSchema,
  type CreateEntriesResponse,
  type DayLogResponse,
  type DeleteEntryResponse,
  type EstimateResponse,
  type FoodResponse,
  type FoodsResponse,
  type UpdateEntryResponse,
} from '@diet-tracker/shared'
import { Hono } from 'hono'
import { z } from 'zod'
import { estimateFood } from '../ai/estimate.js'
import { requireAuth } from '../auth/session-middleware.js'
import { errors, validationDetails } from '../errors.js'
import { jsonBody, requireJson } from '../middleware/validate.js'
import { getProfile } from '../profile/profile-service.js'
import type { AppEnv } from '../types.js'
import { createFood, deleteFood, listFoods, toWireFood, updateFood } from './foods-service.js'
import { createEntries, deleteEntry, getDay, updateEntry } from './log-service.js'

const uuid = z.uuid()

/** A malformed id can only be a broken link, so it reads as "not found" rather than 400. */
function idParam(value: string): string {
  const parsed = uuid.safeParse(value)
  if (!parsed.success) throw errors.notFound()
  return parsed.data
}

function dayParam(value: string): string {
  if (!isValidDay(value)) {
    throw errors.validation({ fieldErrors: { day: ['Use YYYY-MM-DD'] }, formErrors: [] })
  }
  return value
}

export const foodsRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const { user } = requireAuth(c)
    const query = foodsQuerySchema.safeParse(c.req.query())
    if (!query.success) throw errors.validation(validationDetails(query.error))
    const body: FoodsResponse = { foods: await listFoods(user.id, query.data) }
    return c.json(body, 200)
  })

  .post('/', requireJson, jsonBody(foodInputSchema), async (c) => {
    const { user } = requireAuth(c)
    const row = await createFood(user.id, c.req.valid('json'), {
      source: 'manual',
      verified: true,
    })
    const body: FoodResponse = { food: toWireFood(row) }
    return c.json(body, 201)
  })

  .patch('/:id', requireJson, jsonBody(foodInputSchema), async (c) => {
    const { user } = requireAuth(c)
    const row = await updateFood(user.id, idParam(c.req.param('id')), c.req.valid('json'))
    const body: FoodResponse = { food: toWireFood(row) }
    return c.json(body, 200)
  })

  .delete('/:id', async (c) => {
    const { user } = requireAuth(c)
    await deleteFood(user.id, idParam(c.req.param('id')))
    return c.body(null, 204)
  })

export const logRoutes = new Hono<AppEnv>()
  .get('/day/:day', async (c) => {
    const { user } = requireAuth(c)
    const body: DayLogResponse = await getDay(user.id, dayParam(c.req.param('day')))
    return c.json(body, 200)
  })

  .post('/entries', requireJson, jsonBody(createEntriesRequestSchema), async (c) => {
    const { user } = requireAuth(c)
    const body: CreateEntriesResponse = await createEntries(user.id, c.req.valid('json'))
    return c.json(body, 201)
  })

  .patch('/entries/:id', requireJson, jsonBody(updateEntryRequestSchema), async (c) => {
    const { user } = requireAuth(c)
    const body: UpdateEntryResponse = await updateEntry(
      user.id,
      idParam(c.req.param('id')),
      c.req.valid('json'),
    )
    return c.json(body, 200)
  })

  .delete('/entries/:id', async (c) => {
    const { user } = requireAuth(c)
    const body: DeleteEntryResponse = await deleteEntry(user.id, idParam(c.req.param('id')))
    return c.json(body, 200)
  })

export const aiRoutes = new Hono<AppEnv>()
  /** Quick add: text in, a reviewable estimate out. Nothing is logged until confirmed. */
  .post('/estimate', requireJson, jsonBody(estimateRequestSchema), async (c) => {
    const { user } = requireAuth(c)
    const profile = await getProfile(user.id)
    if (!profile) throw errors.profileRequired()
    const input = c.req.valid('json')
    const body: EstimateResponse = await estimateFood({
      userId: user.id,
      profile,
      text: input.text,
      at: input.at ? new Date(input.at) : new Date(),
    })
    return c.json(body, 200)
  })
