import { z } from 'zod'

/** Every error the API returns has this shape and one of these codes. */
export const apiErrorCodeSchema = z.enum([
  'validation_error',
  'unauthenticated',
  'invalid_credentials',
  'email_taken',
  'rate_limited',
  'not_found',
  'payload_too_large',
  'internal_error',
  'service_unavailable',
])
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>

export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
})
export type ApiErrorBody = z.infer<typeof apiErrorSchema>

/** `details` for `validation_error`: one message list per field, plus form-level ones. */
export const validationDetailsSchema = z.object({
  fieldErrors: z.record(z.string(), z.array(z.string())),
  formErrors: z.array(z.string()),
})
export type ValidationDetails = z.infer<typeof validationDetailsSchema>

export const healthResponseSchema = z.object({
  ok: z.boolean(),
  version: z.string(),
  db: z.enum(['ok', 'error']),
})
export type HealthResponse = z.infer<typeof healthResponseSchema>
