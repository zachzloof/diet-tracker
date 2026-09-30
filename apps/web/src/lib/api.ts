import {
  SESSION_TRANSPORT_HEADER,
  SESSION_TRANSPORT_TOKEN,
  apiErrorSchema,
  validationDetailsSchema,
  type ApiErrorCode,
} from '@diet-tracker/shared'
import type { ZodType } from 'zod'
import { API_ORIGIN, isNative } from './native'
import { saveSessionToken, sessionToken } from './session-token'

const BASE = `${API_ORIGIN}/api/v1`

export type ApiErrorKind = ApiErrorCode | 'network'

/** Every failed request becomes one of these, so screens can show the server's message. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorKind,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  /** Field messages from a `validation_error`, keyed by field; empty otherwise. */
  get fieldErrors(): Record<string, string[]> {
    const parsed = validationDetailsSchema.safeParse(this.details)
    return parsed.success ? parsed.data.fieldErrors : {}
  }

  get isNetwork(): boolean {
    return this.code === 'network'
  }
}

export interface RequestInit {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
}

function offlineMessage(): string {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false
  return offline
    ? 'You are offline. Connect to the internet and try again.'
    : 'Could not reach the server. Check your connection and try again.'
}

async function toApiError(res: Response): Promise<ApiError> {
  const json: unknown = await res.json().catch(() => null)
  const parsed = apiErrorSchema.safeParse(json)
  if (parsed.success) {
    const { code, message, details } = parsed.data.error
    return new ApiError(res.status, code, message, details)
  }
  return new ApiError(res.status, 'internal_error', 'Something went wrong. Please try again.')
}

/**
 * A browser authenticates with its same-origin session cookie. The native shells call
 * the API cross-origin, where that cookie is never sent, so they ask login for the token
 * and send it back as a bearer header (D23).
 */
function authHeaders(): Record<string, string> {
  if (!isNative) return {}
  const token = sessionToken()
  return {
    [SESSION_TRANSPORT_HEADER]: SESSION_TRANSPORT_TOKEN,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  }
}

async function send(path: string, init: RequestInit): Promise<Response> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        accept: 'application/json',
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...authHeaders(),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: isNative ? 'omit' : 'same-origin',
    })
  } catch {
    throw new ApiError(0, 'network', offlineMessage())
  }
  if (!res.ok) {
    const error = await toApiError(res)
    // The server no longer knows this token: forget it so the app goes back to sign-in.
    if (error.code === 'unauthenticated') await saveSessionToken(null)
    throw error
  }
  return res
}

/** Sends a request and validates the JSON response against `schema`. */
export async function request<T>(
  path: string,
  schema: ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const res = await send(path, init)
  return schema.parse(await res.json())
}

/** For endpoints that answer with a file: its text and the name the server gave it. */
export async function requestFile(path: string): Promise<{ text: string; filename: string }> {
  const res = await send(path, {})
  const named = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')
  return { text: await res.text(), filename: named?.[1] ?? 'minori-export.txt' }
}

/** For endpoints that answer 204. */
export async function requestVoid(path: string, init: RequestInit = {}): Promise<void> {
  await send(path, init)
}
