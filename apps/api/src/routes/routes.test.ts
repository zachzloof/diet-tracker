import { apiErrorSchema, healthResponseSchema } from '@diet-tracker/shared'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app.js'

const app = createApp()

describe('GET /api/health', () => {
  it('reports ok with a live database', async () => {
    const res = await app.request('/api/health')
    expect(res.status).toBe(200)
    const body = healthResponseSchema.parse(await res.json())
    expect(body).toMatchObject({ ok: true, db: 'ok' })
    expect(body.version).toBeTruthy()
  })
})

describe('request plumbing', () => {
  it('echoes or generates a request id', async () => {
    const given = await app.request('/api/health', { headers: { 'x-request-id': 'abc-123' } })
    expect(given.headers.get('x-request-id')).toBe('abc-123')
    const generated = await app.request('/api/health')
    expect(generated.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('returns the JSON error format for unknown API routes', async () => {
    const res = await app.request('/api/v1/nope')
    expect(res.status).toBe(404)
    expect(apiErrorSchema.parse(await res.json()).error.code).toBe('not_found')
  })

  it('rejects oversized bodies with 413 payload_too_large', async () => {
    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(100_000) }),
    })
    expect(res.status).toBe(413)
    expect(apiErrorSchema.parse(await res.json()).error.code).toBe('payload_too_large')
  })

  it('sets security headers', async () => {
    const res = await app.request('/api/health')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN')
  })
})
