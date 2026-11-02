import { z } from 'zod'
import { storedWeeklyReviewSchema } from './ai/schemas.js'
import { PASSWORD_MAX_LENGTH, newPasswordSchema, publicUserSchema } from './auth.js'
import { coachBriefSchema } from './coach/brief.js'
import { coachMessageSchema, coachNoteSchema, coachThreadSchema } from './coach/schemas.js'
import { dailySummarySchema, foodSchema, logEntrySchema, savedMealSchema } from './log/schemas.js'
import { exerciseSchema, workoutSchema } from './training/schemas.js'
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

/** A coach thread with its messages, oldest first (D41, D24). */
export const exportedCoachThreadSchema = z.object({
  ...coachThreadSchema.shape,
  messages: z.array(coachMessageSchema),
})

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
  savedMeals: z.array(savedMealSchema),
  /** The person's own exercises; the shared catalogue is not theirs to export. */
  exercises: z.array(exerciseSchema),
  workouts: z.array(workoutSchema),
  logEntries: z.array(logEntrySchema),
  dailySummaries: z.array(dailySummarySchema),
  weeklyReviews: z.array(exportedWeeklyReviewSchema),
  coachThreads: z.array(exportedCoachThreadSchema),
  /** Lines the person asked the coach to remember (slice 11b). */
  coachNotes: z.array(coachNoteSchema),
  /** The one-line daily briefs the model wrote (slice 11c), oldest first. */
  coachBriefs: z.array(coachBriefSchema),
  aiUsage: z.object({
    calls: z.number().int().min(0),
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
    webSearchCalls: z.number().int().min(0),
  }),
})
export type AccountExport = z.infer<typeof accountExportSchema>

/** 2 added `savedMeals`; 3 added `exercises` (custom only) and `workouts` (slice 8); 4 added `coachThreads` (slice 11a); 5 added `coachNotes` (slice 11b); 6 added `coachBriefs` (slice 11c). */
export const ACCOUNT_EXPORT_SCHEMA_VERSION = 6
