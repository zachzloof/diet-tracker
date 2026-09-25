import { z } from 'zod'

/** Emails are trimmed and lower-cased before validation; the DB column is citext anyway. */
export const emailSchema = z
  .string({ error: 'Enter your email address' })
  .trim()
  .toLowerCase()
  .max(254, 'That email address is too long')
  .pipe(z.email({ error: 'Enter a valid email address' }))

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 200

export const newPasswordSchema = z
  .string({ error: 'Choose a password' })
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters`)

export const registerInputSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
})
export type RegisterInput = z.infer<typeof registerInputSchema>

export const loginInputSchema = z.object({
  email: emailSchema,
  password: z
    .string({ error: 'Enter your password' })
    .min(1, 'Enter your password')
    .max(PASSWORD_MAX_LENGTH, 'That password is too long'),
})
export type LoginInput = z.infer<typeof loginInputSchema>

/** What the API tells the browser about the signed-in person. Never includes the hash. */
export const publicUserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  createdAt: z.iso.datetime(),
})
export type PublicUser = z.infer<typeof publicUserSchema>

export const authResponseSchema = z.object({
  user: publicUserSchema,
})
export type AuthResponse = z.infer<typeof authResponseSchema>
