import { z } from 'zod'
import { storedWeeklyReviewSchema } from './ai/schemas.js'
import { PASSWORD_MAX_LENGTH, newPasswordSchema, publicUserSchema } from './auth.js'
import { dailySummarySchema, foodSchema, logEntrySchema } from './log/schemas.js'
import { profileSchema } from './profile.js'
import { weightEntrySchema } from './progress-api.js'
import { targetVersionSchema } from './targets-api.js'

/** Wire shapes for `/api/v1/account` (slice 5): password, export, delete. */

const currentPassword = (message: string) =>
  z.string({ error: message }).min(1, message).max(PASSWORD_MAX_LENGTH, 'That password is too long')

export const changePasswordRequestSchema = z
  .object({
    currentPassword: currentPassword('Enter your current password'),
    newPassword: newPasswordSchema,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ['newPassword'],
    message: 'Choose a different password from your current one',
  })
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>

export const deleteAccountRequestSchema = z.object({
  password: currentPassword('Enter your password to confirm'),
})
export type DeleteAccountRequest = z.infer<typeof deleteAccountRequestSchema>

export const EXPORT_FORMATS = ['json', 'log.csv', 'weight.csv'] as const
export const exportFormatSchema = z.enum(EXPORT_FORMATS)
export type ExportFormat = z.infer<typeof exportFormatSchema>

export const exportedWeeklyReviewSchema = z.object({
  isoWeek: z.string(),
  ...storedWeeklyReviewSchema.shape,
})

/** Everything the app holds about a person, validated on the way out. */
export const accountExportSchema = z.object({
  exportedAt: z.iso.datetime(),
  app: z.object({ name: z.string(), version: z.string(), schema: z.number().int() }),
  user: publicUserSchema,
  profile: profileSchema.nullable(),
  targetVersions: z.array(targetVersionSchema),
  weightEntries: z.array(weightEntrySchema),
  foods: z.array(foodSchema),
  logEntries: z.array(logEntrySchema),
  dailySummaries: z.array(dailySummarySchema),
  weeklyReviews: z.array(exportedWeeklyReviewSchema),
  aiUsage: z.object({
    calls: z.number().int().min(0),
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
    webSearchCalls: z.number().int().min(0),
  }),
})
export type AccountExport = z.infer<typeof accountExportSchema>

export const ACCOUNT_EXPORT_SCHEMA_VERSION = 1
