import {
  authResponseSchema,
  type AuthResponse,
  type LoginInput,
  type PublicUser,
  type RegisterInput,
} from '@diet-tracker/shared'
import { request, requestVoid } from '@/lib/api'
import { saveSessionToken } from '@/lib/session-token'

/** The native shells get their session token in the body (D23); a browser gets a cookie. */
async function signedIn({ user, session }: AuthResponse): Promise<PublicUser> {
  if (session) await saveSessionToken(session.token)
  return user
}

export const authApi = {
  async me(): Promise<PublicUser> {
    const { user } = await request('/me', authResponseSchema)
    return user
  },
  async register(input: RegisterInput): Promise<PublicUser> {
    return signedIn(
      await request('/auth/register', authResponseSchema, { method: 'POST', body: input }),
    )
  },
  async login(input: LoginInput): Promise<PublicUser> {
    return signedIn(
      await request('/auth/login', authResponseSchema, { method: 'POST', body: input }),
    )
  },
  async logout(): Promise<void> {
    try {
      await requestVoid('/auth/logout', { method: 'POST' })
    } finally {
      await saveSessionToken(null)
    }
  },
}
