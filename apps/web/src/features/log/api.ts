import {
  createEntriesResponseSchema,
  dayLogResponseSchema,
  deleteEntryResponseSchema,
  deleteGroupResponseSchema,
  estimateResponseSchema,
  foodResponseSchema,
  foodsResponseSchema,
  updateEntryResponseSchema,
  updateGroupResponseSchema,
  type CreateEntriesRequest,
  type CreateEntriesResponse,
  type DayLogResponse,
  type DeleteEntryResponse,
  type DeleteGroupResponse,
  type EstimateRequest,
  type EstimateResponse,
  type Food,
  type FoodInput,
  type UpdateEntryRequest,
  type UpdateEntryResponse,
  type UpdateGroupRequest,
  type UpdateGroupResponse,
} from '@diet-tracker/shared'
import { request, requestVoid } from '@/lib/api'

export const logApi = {
  day(day: string): Promise<DayLogResponse> {
    return request(`/log/day/${day}`, dayLogResponseSchema)
  },
  createEntries(input: CreateEntriesRequest): Promise<CreateEntriesResponse> {
    return request('/log/entries', createEntriesResponseSchema, { method: 'POST', body: input })
  },
  updateEntry(id: string, patch: UpdateEntryRequest): Promise<UpdateEntryResponse> {
    return request(`/log/entries/${id}`, updateEntryResponseSchema, {
      method: 'PATCH',
      body: patch,
    })
  },
  deleteEntry(id: string): Promise<DeleteEntryResponse> {
    return request(`/log/entries/${id}`, deleteEntryResponseSchema, { method: 'DELETE' })
  },
  updateGroup(groupId: string, patch: UpdateGroupRequest): Promise<UpdateGroupResponse> {
    return request(`/log/groups/${groupId}`, updateGroupResponseSchema, {
      method: 'PATCH',
      body: patch,
    })
  },
  deleteGroup(groupId: string): Promise<DeleteGroupResponse> {
    return request(`/log/groups/${groupId}`, deleteGroupResponseSchema, { method: 'DELETE' })
  },
  estimate(input: EstimateRequest): Promise<EstimateResponse> {
    return request('/ai/estimate', estimateResponseSchema, { method: 'POST', body: input })
  },
}

export const foodsApi = {
  async list(q: string): Promise<Food[]> {
    const params = q ? `?q=${encodeURIComponent(q)}` : ''
    const { foods } = await request(`/foods${params}`, foodsResponseSchema)
    return foods
  },
  async create(input: FoodInput): Promise<Food> {
    const { food } = await request('/foods', foodResponseSchema, { method: 'POST', body: input })
    return food
  },
  async update(id: string, input: FoodInput): Promise<Food> {
    const { food } = await request(`/foods/${id}`, foodResponseSchema, {
      method: 'PATCH',
      body: input,
    })
    return food
  },
  remove(id: string): Promise<void> {
    return requestVoid(`/foods/${id}`, { method: 'DELETE' })
  },
}
