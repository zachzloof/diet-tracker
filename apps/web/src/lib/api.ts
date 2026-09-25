import { apiErrorSchema, validationDetailsSchema, type ApiErrorCode } from '@diet-tracker/shared'
import type { ZodType } from 'zod'

const BASE = '/api/v1'

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

async function send(path: string, init: RequestInit): Promise<Response> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        accept: 'application/json',
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError(0, 'network', offlineMessage())
  }
  if (!res.ok) throw await toApiError(res)
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

/** For endpoints that answer 204. */
export async function requestVoid(path: string, init: RequestInit = {}): Promise<void> {
  await send(path, init)
}
