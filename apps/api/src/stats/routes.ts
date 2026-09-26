import {
  monthStatsQuerySchema,
  weekStatsQuerySchema,
  weeklyReviewQuerySchema,
  type MonthStatsResponse,
  type WeekStatsResponse,
  type WeeklyReviewResponse,
} from '@diet-tracker/shared'
import { Hono } from 'hono'
import { weeklyReview } from '../ai/weekly-review.js'
import { requireAuth } from '../auth/session-middleware.js'
import { errors, validationDetails } from '../errors.js'
import { getProfile } from '../profile/profile-service.js'
import type { AppEnv } from '../types.js'
import { monthStats, weekStats } from './stats-service.js'

async function requireProfile(userId: string) {
  const profile = await getProfile(userId)
  if (!profile) throw errors.profileRequired()
  return profile
}

export const statsRoutes = new Hono<AppEnv>()
  /** Seven days ending on `end` (default today), scored, with the streak and the gaps. */
  .get('/week', async (c) => {
    const { user } = requireAuth(c)
    const query = weekStatsQuerySchema.safeParse(c.req.query())
    if (!query.success) throw errors.validation(validationDetails(query.error))
    const profile = await requireProfile(user.id)
    const body: WeekStatsResponse = await weekStats(user.id, profile, query.data.end)
    return c.json(body, 200)
  })

  /** Day-met dots for a month's calendar. */
  .get('/month', async (c) => {
    const { user } = requireAuth(c)
    const query = monthStatsQuerySchema.safeParse(c.req.query())
    if (!query.success) throw errors.validation(validationDetails(query.error))
    const profile = await requireProfile(user.id)
    const body: MonthStatsResponse = await monthStats(user.id, profile, query.data.month)
    return c.json(body, 200)
  })

export const weeklyReviewRoutes = new Hono<AppEnv>()
  /** The cached review for the week, or a fresh one (at most one generation a day; `?force=1` regenerates). */
  .post('/weekly-review', async (c) => {
    const { user } = requireAuth(c)
    const query = weeklyReviewQuerySchema.safeParse(c.req.query())
    if (!query.success) throw errors.validation(validationDetails(query.error))
    const profile = await requireProfile(user.id)
    const body: WeeklyReviewResponse = await weeklyReview({
      userId: user.id,
      profile,
      end: query.data.end,
      force: query.data.force !== undefined,
    })
    return c.json(body, 200)
  })
