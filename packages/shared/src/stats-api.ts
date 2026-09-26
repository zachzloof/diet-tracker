import { z } from 'zod'
import { storedWeeklyReviewSchema } from './ai/schemas.js'
import { gapSchema } from './nutrition/gaps.js'
import { scoredDaySchema } from './nutrition/week.js'

/** Wire shapes for `/api/v1/stats` and `/api/v1/ai/weekly-review`. */

export const MONTH_RE = /^\d{4}-\d{2}$/
export const monthSchema = z.string().regex(MONTH_RE, 'Use YYYY-MM')

export const weekStatsQuerySchema = z.object({
  /** The last day of the seven-day window; defaults to the user's local today. */
  end: z.iso.date().optional(),
})
export type WeekStatsQuery = z.infer<typeof weekStatsQuerySchema>

export const weekStatsResponseSchema = z.object({
  start: z.iso.date(),
  end: z.iso.date(),
  /** The user's local today, so the client can mark it without trusting its own clock. */
  today: z.iso.date(),
  /** Seven days, oldest first; each scored against the targets in force that day. */
  days: z.array(scoredDaySchema),
  daysLogged: z.number().int().min(0),
  daysMet: z.number().int().min(0),
  /** Consecutive met days ending today or yesterday, computed over recent history. */
  streak: z.number().int().min(0),
  gaps: z.array(gapSchema),
})
export type WeekStatsResponse = z.infer<typeof weekStatsResponseSchema>

export const monthStatsQuerySchema = z.object({
  /** `YYYY-MM`; defaults to the month of the user's local today. */
  month: monthSchema.optional(),
})
export type MonthStatsQuery = z.infer<typeof monthStatsQuerySchema>

export const monthDaySchema = z.object({
  day: z.iso.date(),
  logged: z.boolean(),
  dayMet: z.boolean(),
})
export type MonthDay = z.infer<typeof monthDaySchema>

export const monthStatsResponseSchema = z.object({
  month: monthSchema,
  today: z.iso.date(),
  /** Only days with a summary row; every other day is unlogged. */
  days: z.array(monthDaySchema),
})
export type MonthStatsResponse = z.infer<typeof monthStatsResponseSchema>

/** Fewer logged days than this and the review is not generated. */
export const MIN_REVIEW_DAYS = 2

export const weeklyReviewQuerySchema = z.object({
  end: z.iso.date().optional(),
  force: z.enum(['1', 'true']).optional(),
})
export type WeeklyReviewQuery = z.infer<typeof weeklyReviewQuerySchema>

export const weeklyReviewResponseSchema = z.object({
  /** Null when the week has too few logged days to review. */
  review: storedWeeklyReviewSchema.nullable(),
  daysLogged: z.number().int().min(0),
  minimumDays: z.number().int().min(0),
})
export type WeeklyReviewResponse = z.infer<typeof weeklyReviewResponseSchema>
