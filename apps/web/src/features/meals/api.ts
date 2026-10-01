import {
  savedMealResponseSchema,
  savedMealsResponseSchema,
  type SavedMeal,
  type SavedMealInput,
} from '@diet-tracker/shared'
import { request, requestVoid } from '@/lib/api'

export const mealsApi = {
  async list(): Promise<SavedMeal[]> {
    const { meals } = await request('/meals', savedMealsResponseSchema)
    return meals
  },
  async create(input: SavedMealInput): Promise<SavedMeal> {
    const { meal } = await request('/meals', savedMealResponseSchema, {
      method: 'POST',
      body: input,
    })
    return meal
  },
  async update(id: string, input: SavedMealInput): Promise<SavedMeal> {
    const { meal } = await request(`/meals/${id}`, savedMealResponseSchema, {
      method: 'PATCH',
      body: input,
    })
    return meal
  },
  remove(id: string): Promise<void> {
    return requestVoid(`/meals/${id}`, { method: 'DELETE' })
  },
}
