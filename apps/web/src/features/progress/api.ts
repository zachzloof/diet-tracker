import {
  applyRecalibrationResponseSchema,
  recalibrationResponseSchema,
  snoozeRecalibrationResponseSchema,
  weightResponseSchema,
  weightsResponseSchema,
  type ApplyRecalibrationResponse,
  type RecalibrationAssessment,
  type UpsertWeightRequest,
  type WeightResponse,
  type WeightsResponse,
} from '@diet-tracker/shared'
import { request, requestVoid } from '@/lib/api'

export const weightApi = {
  list(days: number): Promise<WeightsResponse> {
    return request(`/weight?days=${days}`, weightsResponseSchema)
  },
  upsert(input: UpsertWeightRequest): Promise<WeightResponse> {
    return request('/weight', weightResponseSchema, { method: 'PUT', body: input })
  },
  remove(day: string): Promise<void> {
    return requestVoid(`/weight/${day}`, { method: 'DELETE' })
  },
}

export const recalibrationApi = {
  async assess(): Promise<RecalibrationAssessment> {
    const { assessment } = await request('/recalibration', recalibrationResponseSchema)
    return assessment
  },
  apply(expectedEnergyKcal: number): Promise<ApplyRecalibrationResponse> {
    return request('/recalibration/apply', applyRecalibrationResponseSchema, {
      method: 'POST',
      body: { expectedEnergyKcal },
    })
  },
  async snooze(): Promise<string> {
    const { snoozedUntil } = await request(
      '/recalibration/snooze',
      snoozeRecalibrationResponseSchema,
      { method: 'POST' },
    )
    return snoozedUntil
  },
}
