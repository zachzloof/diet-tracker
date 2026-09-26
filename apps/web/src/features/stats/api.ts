import {
  monthStatsResponseSchema,
  weekStatsResponseSchema,
  weeklyReviewResponseSchema,
  type MonthStatsResponse,
  type WeekStatsResponse,
  type WeeklyReviewResponse,
} from '@diet-tracker/shared'
import { request } from '@/lib/api'

export const statsApi = {
  week(end: string): Promise<WeekStatsResponse> {
    return request(`/stats/week?end=${end}`, weekStatsResponseSchema)
  },
  month(month: string): Promise<MonthStatsResponse> {
    return request(`/stats/month?month=${month}`, monthStatsResponseSchema)
  },
  weeklyReview(end: string, force = false): Promise<WeeklyReviewResponse> {
    return request(
      `/ai/weekly-review?end=${end}${force ? '&force=1' : ''}`,
      weeklyReviewResponseSchema,
      { method: 'POST' },
    )
  },
}
