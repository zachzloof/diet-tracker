import {
  toValidationDetails,
  type ApiErrorBody,
  type ApiErrorCode,
  type OverrideWarning,
  type ValidationDetails,
} from '@diet-tracker/shared'
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { logger } from './logger.js'
import type { AppEnv } from './types.js'

/** An error the API deliberately returns. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }

  toBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details !== undefined ? { details: this.details } : {}),
      },
    }
  }
}

function humaniseSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`
  const minutes = Math.ceil(seconds / 60)
  return `${minutes} minute${minutes === 1 ? '' : 's'}`
}

/** Failure copy per purpose (ai-food-estimation skill): short, blame-free, with the next action. */
export const AI_UNAVAILABLE_MESSAGES = {
  explain_plan: 'The explanation is unavailable right now. Your targets are not affected.',
  estimate: 'The estimator is unavailable right now. You can add this meal manually.',
  weekly_review: 'The weekly review is unavailable right now. Your numbers are not affected.',
} as const

export const errors = {
  validation: (details: ValidationDetails) =>
    new AppError(400, 'validation_error', 'Check the highlighted fields', details),
  unauthenticated: () => new AppError(401, 'unauthenticated', 'Sign in to continue'),
  invalidCredentials: () =>
    new AppError(401, 'invalid_credentials', 'Email or password is incorrect'),
  notFound: () => new AppError(404, 'not_found', 'Not found'),
  emailTaken: () => new AppError(409, 'email_taken', 'An account with that email already exists'),
  payloadTooLarge: () => new AppError(413, 'payload_too_large', 'That request is too large'),
  profileRequired: () =>
    new AppError(409, 'profile_required', 'Set up your profile to get your targets'),
  overrideBlocked: (blocked: OverrideWarning[]) =>
    new AppError(422, 'override_blocked', 'That value is below a safe minimum', { blocked }),
  aiUnavailable: (message: string = AI_UNAVAILABLE_MESSAGES.explain_plan) =>
    new AppError(503, 'ai_unavailable', message),
  aiCapReached: (cap: number, used: number) =>
    new AppError(
      429,
      'ai_cap_reached',
      `You've used today's ${cap} AI estimates. You can still add meals manually or from My foods; the cap resets at midnight.`,
      { cap, used },
    ),
  aiUnclear: () =>
    new AppError(
      422,
      'ai_unclear',
      "Couldn't work out what that was. Try rephrasing, or add it manually.",
    ),
  rateLimited: (retryAfterSeconds: number) =>
    new AppError(
      429,
      'rate_limited',
      `Too many attempts. Try again in ${humaniseSeconds(retryAfterSeconds)}.`,
      { retryAfterSeconds },
    ),
}

export const validationDetails = toValidationDetails

export function handleError(error: Error, c: Context<AppEnv>): Response {
  if (error instanceof AppError) {
    if (error.code === 'rate_limited' && typeof error.details === 'object' && error.details) {
      const retry = Reflect.get(error.details, 'retryAfterSeconds')
      if (typeof retry === 'number') c.header('Retry-After', String(retry))
    }
    return c.json(error.toBody(), error.status)
  }

  if (error instanceof HTTPException) {
    const mapped =
      error.status === 404
        ? errors.notFound()
        : error.status === 413
          ? errors.payloadTooLarge()
          : error.status === 401
            ? errors.unauthenticated()
            : null
    if (mapped) return c.json(mapped.toBody(), mapped.status)
  }

  const log = c.get('log') ?? logger
  log.error({ err: error, path: c.req.path, method: c.req.method }, 'unhandled error')
  const body: ApiErrorBody = {
    error: { code: 'internal_error', message: 'Something went wrong. Please try again.' },
  }
  return c.json(body, 500)
}
