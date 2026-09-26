import {
  changePasswordRequestSchema,
  deleteAccountRequestSchema,
  exportFormatSchema,
  localDay,
} from '@diet-tracker/shared'
import { Hono } from 'hono'
import { requireAuth } from '../auth/session-middleware.js'
import { clearSessionCookie } from '../auth/session-service.js'
import { errors } from '../errors.js'
import { jsonBody, requireJson } from '../middleware/validate.js'
import { getProfile } from '../profile/profile-service.js'
import type { AppEnv } from '../types.js'
import {
  changePassword,
  deleteAccount,
  exportAccount,
  logEntriesCsv,
  weightsCsv,
} from './account-service.js'

export const accountRoutes = new Hono<AppEnv>()
  .post('/password', requireJson, jsonBody(changePasswordRequestSchema), async (c) => {
    const { user, session } = requireAuth(c)
    const input = c.req.valid('json')
    await changePassword(user, session.id, input.currentPassword, input.newPassword)
    return c.body(null, 204)
  })

  /**
   * Everything the app holds, as one JSON file or a CSV of the food log or the weigh-ins.
   * Served as an attachment so a phone saves it to Files.
   */
  .get('/export/:format', async (c) => {
    const { user } = requireAuth(c)
    const format = exportFormatSchema.safeParse(c.req.param('format'))
    if (!format.success) throw errors.notFound()
    const data = await exportAccount(user)
    const profile = await getProfile(user.id)
    const stamp = localDay(new Date(), profile?.timezone ?? 'UTC')
    const base = `diet-tracker-${stamp}`
    switch (format.data) {
      case 'json':
        c.header('Content-Disposition', `attachment; filename="${base}.json"`)
        c.header('Cache-Control', 'no-store')
        return c.json(data, 200)
      case 'log.csv':
        c.header('Content-Disposition', `attachment; filename="${base}-food-log.csv"`)
        c.header('Cache-Control', 'no-store')
        return c.text(logEntriesCsv(data), 200, { 'Content-Type': 'text/csv; charset=utf-8' })
      case 'weight.csv':
        c.header('Content-Disposition', `attachment; filename="${base}-weight.csv"`)
        c.header('Cache-Control', 'no-store')
        return c.text(weightsCsv(data), 200, { 'Content-Type': 'text/csv; charset=utf-8' })
    }
  })

  /** Deletes the account and every row that belongs to it. The cookie is cleared. */
  .delete('/', requireJson, jsonBody(deleteAccountRequestSchema), async (c) => {
    const { user } = requireAuth(c)
    await deleteAccount(user, c.req.valid('json').password)
    clearSessionCookie(c)
    return c.body(null, 204)
  })
