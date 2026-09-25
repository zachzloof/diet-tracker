import {
  overridesInputSchema,
  profileInputSchema,
  type ExplainResponse,
  type OverridesResponse,
  type ProfileResponse,
  type ProfileSaveResponse,
  type TargetHistoryResponse,
  type TargetsResponse,
} from '@diet-tracker/shared'
import { Hono } from 'hono'
import { explainPlan } from '../ai/explain-plan.js'
import { requireAuth } from '../auth/session-middleware.js'
import { errors } from '../errors.js'
import { jsonBody, requireJson } from '../middleware/validate.js'
import type { AppEnv } from '../types.js'
import { getProfile, saveProfile } from './profile-service.js'
import {
  listVersions,
  requireLatestVersion,
  setOverrides,
  toWireVersion,
} from './targets-service.js'

export const profileRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const { user } = requireAuth(c)
    const body: ProfileResponse = { profile: await getProfile(user.id) }
    return c.json(body, 200)
  })

  .put('/', requireJson, jsonBody(profileInputSchema), async (c) => {
    const { user } = requireAuth(c)
    const result = await saveProfile(user.id, c.req.valid('json'))
    const body: ProfileSaveResponse = {
      profile: result.profile,
      version: toWireVersion(result.version),
      targetsChanged: result.targetsChanged,
    }
    return c.json(body, 200)
  })

export const targetsRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const { user } = requireAuth(c)
    const version = await requireLatestVersion(user.id)
    const body: TargetsResponse = { version: toWireVersion(version) }
    return c.json(body, 200)
  })

  .get('/history', async (c) => {
    const { user } = requireAuth(c)
    const body: TargetHistoryResponse = { versions: await listVersions(user.id) }
    return c.json(body, 200)
  })

  .patch('/overrides', requireJson, jsonBody(overridesInputSchema), async (c) => {
    const { user } = requireAuth(c)
    const result = await setOverrides(user.id, c.req.valid('json'))
    const body: OverridesResponse = {
      version: toWireVersion(result.version),
      warnings: result.warnings,
    }
    return c.json(body, 200)
  })

  /** Returns the cached explanation, or generates one. `?force=1` regenerates. */
  .post('/explain', async (c) => {
    const { user } = requireAuth(c)
    const version = await requireLatestVersion(user.id)
    const force = c.req.query('force') === '1'
    if (version.explanation && !force) {
      const body: ExplainResponse = { explanation: version.explanation }
      return c.json(body, 200)
    }
    const profile = await getProfile(user.id)
    if (!profile) throw errors.profileRequired()
    const explanation = await explainPlan(user.id, profile, version)
    const body: ExplainResponse = { explanation }
    return c.json(body, 200)
  })
