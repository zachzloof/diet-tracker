import {
  authResponseSchema,
  type LoginInput,
  type PublicUser,
  type RegisterInput,
} from '@diet-tracker/shared'
import { request, requestVoid } from '@/lib/api'

export const authApi = {
  async me(): Promise<PublicUser> {
    const { user } = await request('/me', authResponseSchema)
    return user
  },
  async register(input: RegisterInput): Promise<PublicUser> {
    const { user } = await request('/auth/register', authResponseSchema, {
      method: 'POST',
      body: input,
    })
    return user
  },
  async login(input: LoginInput): Promise<PublicUser> {
    const { user } = await request('/auth/login', authResponseSchema, {
      method: 'POST',
      body: input,
    })
    return user
  },
  logout(): Promise<void> {
    return requestVoid('/auth/logout', { method: 'POST' })
  },
}
