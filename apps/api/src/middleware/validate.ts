import { createMiddleware } from 'hono/factory'
import { validator } from 'hono/validator'
import type { ZodType } from 'zod'
import { errors, validationDetails } from '../errors.js'

/**
 * Rejects a missing, non-JSON or malformed body with the app's own error format
 * before Hono's validator sees it. `c.req.json()` caches the parsed body.
 */
export const requireJson = createMiddleware(async (c, next) => {
  const type = c.req.header('content-type') ?? ''
  if (!type.toLowerCase().includes('application/json')) {
    throw errors.validation({ fieldErrors: {}, formErrors: ['Send a JSON body'] })
  }
  try {
    await c.req.json()
  } catch {
    throw errors.validation({ fieldErrors: {}, formErrors: ['The request body is not valid JSON'] })
  }
  await next()
})

/** Validates the JSON body against a zod schema; handlers read it with `c.req.valid('json')`. */
export function jsonBody<T extends ZodType>(schema: T) {
  return validator('json', (value) => {
    const result = schema.safeParse(value)
    if (!result.success) throw errors.validation(validationDetails(result.error))
    return result.data
  })
}
