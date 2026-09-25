import { authResponseSchema } from '@diet-tracker/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request, requestVoid } from './api'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('request', () => {
  it('parses a successful response with the given schema', async () => {
    const user = {
      id: '0192b1d0-0000-7000-8000-000000000000',
      email: 'a@b.co',
      createdAt: '2026-09-25T00:00:00.000Z',
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { user })))
    const result = await request('/me', authResponseSchema)
    expect(result.user.email).toBe('a@b.co')
  })

  it('turns the API error envelope into an ApiError with code, message and field errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(400, {
          error: {
            code: 'validation_error',
            message: 'Check the highlighted fields',
            details: { fieldErrors: { email: ['Enter a valid email address'] }, formErrors: [] },
          },
        }),
      ),
    )
    const error = await request('/auth/login', authResponseSchema, {
      method: 'POST',
      body: {},
    }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    if (!(error instanceof ApiError)) return
    expect(error.status).toBe(400)
    expect(error.code).toBe('validation_error')
    expect(error.fieldErrors).toEqual({ email: ['Enter a valid email address'] })
  })

  it('reports a network failure as a network ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const error = await requestVoid('/auth/logout', { method: 'POST' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    if (!(error instanceof ApiError)) return
    expect(error.isNetwork).toBe(true)
    expect(error.status).toBe(0)
  })

  it('falls back to a generic message when the error body is not the envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad Gateway', { status: 502 })))
    const error = await requestVoid('/x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    if (!(error instanceof ApiError)) return
    expect(error.code).toBe('internal_error')
    expect(error.message).toMatch(/went wrong/)
  })
})
