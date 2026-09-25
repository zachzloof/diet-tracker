import { describe, expect, it } from 'vitest'
import { loginInputSchema, registerInputSchema } from './auth.js'

describe('registerInputSchema', () => {
  it('normalises the email and accepts an 8 character password', () => {
    const parsed = registerInputSchema.parse({
      email: '  Finn@Example.COM ',
      password: 'password',
    })
    expect(parsed.email).toBe('finn@example.com')
  })

  it('rejects an invalid email and a short password with readable messages', () => {
    const result = registerInputSchema.safeParse({ email: 'not-an-email', password: 'short' })
    expect(result.success).toBe(false)
    if (result.success) return
    const messages = result.error.issues.map((issue) => issue.message)
    expect(messages).toContain('Enter a valid email address')
    expect(messages).toContain('Use at least 8 characters')
  })
})

describe('loginInputSchema', () => {
  it('requires a password but does not apply the new-password length rule', () => {
    expect(loginInputSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false)
    expect(loginInputSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true)
  })
})
