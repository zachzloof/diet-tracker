import {
  explainResponseSchema,
  overridesResponseSchema,
  profileResponseSchema,
  profileSaveResponseSchema,
  targetHistoryResponseSchema,
  targetsResponseSchema,
  type ExplainResponse,
  type OverridesInput,
  type OverridesResponse,
  type Profile,
  type ProfileInput,
  type ProfileSaveResponse,
  type TargetHistoryItem,
  type TargetVersion,
} from '@diet-tracker/shared'
import { request } from '@/lib/api'

export const profileApi = {
  async get(): Promise<Profile | null> {
    const { profile } = await request('/profile', profileResponseSchema)
    return profile
  },
  save(input: ProfileInput): Promise<ProfileSaveResponse> {
    return request('/profile', profileSaveResponseSchema, { method: 'PUT', body: input })
  },
}

export const targetsApi = {
  async current(): Promise<TargetVersion> {
    const { version } = await request('/targets', targetsResponseSchema)
    return version
  },
  async history(): Promise<TargetHistoryItem[]> {
    const { versions } = await request('/targets/history', targetHistoryResponseSchema)
    return versions
  },
  overrides(input: OverridesInput): Promise<OverridesResponse> {
    return request('/targets/overrides', overridesResponseSchema, {
      method: 'PATCH',
      body: input,
    })
  },
  explain(force = false): Promise<ExplainResponse> {
    return request(`/targets/explain${force ? '?force=1' : ''}`, explainResponseSchema, {
      method: 'POST',
    })
  },
}
