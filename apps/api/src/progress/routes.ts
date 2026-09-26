import {
  applyRecalibrationRequestSchema,
  isValidDay,
  upsertWeightRequestSchema,
  weightsQuerySchema,
  type ApplyRecalibrationResponse,
  type RecalibrationResponse,
  type SnoozeRecalibrationResponse,
  type WeightResponse,
  type WeightsResponse,
} from '@diet-tracker/shared'
import { Hono } from 'hono'
import { requireAuth } from '../auth/session-middleware.js'
import { errors, validationDetails } from '../errors.js'
import { jsonBody, requireJson } from '../middleware/validate.js'
import { getProfile } from '../profile/profile-service.js'
import { toWireVersion } from '../profile/targets-service.js'
import type { AppEnv } from '../types.js'
import { apply, assess, snooze } from './recalibration-service.js'
import { deleteWeight, listWeights, upsertWeight } from './weight-service.js'

async function requireProfile(userId: string) {
  const profile = await getProfile(userId)
  if (!profile) throw errors.profileRequired()
  return profile
}

export const weightRoutes = new Hono<AppEnv>()
  /** Weigh-ins for the last `days` days, ascending, with the goal weight and expected pace. */
  .get('/', async (c) => {
    const { user } = requireAuth(c)
    const query = weightsQuerySchema.safeParse(c.req.query())
    if (!query.success) throw errors.validation(validationDetails(query.error))
    const profile = await requireProfile(user.id)
    const body: WeightsResponse = await listWeights(user.id, profile, query.data)
    return c.json(body, 200)
  })

  /** Records (or corrects) the weigh-in for a day. */
  .put('/', requireJson, jsonBody(upsertWeightRequestSchema), async (c) => {
    const { user } = requireAuth(c)
    const profile = await requireProfile(user.id)
    const body: WeightResponse = await upsertWeight(user.id, profile, c.req.valid('json'))
    return c.json(body, 200)
  })

  .delete('/:day', async (c) => {
    const { user } = requireAuth(c)
    const day = c.req.param('day')
    if (!isValidDay(day)) throw errors.notFound()
    await deleteWeight(user.id, day)
    return c.body(null, 204)
  })

export const recalibrationRoutes = new Hono<AppEnv>()
  /** Where the plan stands: not due, needs data, on track, or a proposal to confirm. */
  .get('/', async (c) => {
    const { user } = requireAuth(c)
    const profile = await requireProfile(user.id)
    const { assessment } = await assess(user.id, profile)
    const body: RecalibrationResponse = { assessment }
    return c.json(body, 200)
  })

  /** Confirms the proposal: a new target version with the trigger `recalibration`. */
  .post('/apply', requireJson, jsonBody(applyRecalibrationRequestSchema), async (c) => {
    const { user } = requireAuth(c)
    const profile = await requireProfile(user.id)
    const version = await apply(user.id, profile, c.req.valid('json').expectedEnergyKcal)
    const body: ApplyRecalibrationResponse = { version: toWireVersion(version) }
    return c.json(body, 200)
  })

  /** "Not now": hides the proposal for two weeks. */
  .post('/snooze', async (c) => {
    const { user } = requireAuth(c)
    const profile = await requireProfile(user.id)
    const body: SnoozeRecalibrationResponse = { snoozedUntil: await snooze(user.id, profile) }
    return c.json(body, 200)
  })
