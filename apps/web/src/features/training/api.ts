import {
  exerciseHistoryResponseSchema,
  exerciseResponseSchema,
  exercisesResponseSchema,
  workoutResponseSchema,
  workoutsResponseSchema,
  type Exercise,
  type ExerciseHistoryEntry,
  type ExerciseInput,
  type Workout,
  type WorkoutInput,
} from '@diet-tracker/shared'
import { request, requestVoid } from '@/lib/api'

export const exercisesApi = {
  async list(): Promise<Exercise[]> {
    const { exercises } = await request('/exercises', exercisesResponseSchema)
    return exercises
  },
  async create(input: ExerciseInput): Promise<Exercise> {
    const { exercise } = await request('/exercises', exerciseResponseSchema, {
      method: 'POST',
      body: input,
    })
    return exercise
  },
  async update(id: string, input: ExerciseInput): Promise<Exercise> {
    const { exercise } = await request(`/exercises/${id}`, exerciseResponseSchema, {
      method: 'PATCH',
      body: input,
    })
    return exercise
  },
  remove(id: string): Promise<void> {
    return requestVoid(`/exercises/${id}`, { method: 'DELETE' })
  },
  /** Newest first, at most `limit`, none before `from` when it is given. */
  async history(id: string, limit: number, from?: string): Promise<ExerciseHistoryEntry[]> {
    const query = from === undefined ? `limit=${limit}` : `limit=${limit}&from=${from}`
    const { history } = await request(
      `/exercises/${id}/history?${query}`,
      exerciseHistoryResponseSchema,
    )
    return history
  },
}

export const workoutsApi = {
  async list(from: string, to: string): Promise<Workout[]> {
    const { workouts } = await request(`/workouts?from=${from}&to=${to}`, workoutsResponseSchema)
    return workouts
  },
  async get(id: string): Promise<Workout> {
    const { workout } = await request(`/workouts/${id}`, workoutResponseSchema)
    return workout
  },
  /** Creates or replaces the session with this client-minted id (D35). */
  async put(id: string, input: WorkoutInput): Promise<Workout> {
    const { workout } = await request(`/workouts/${id}`, workoutResponseSchema, {
      method: 'PUT',
      body: input,
    })
    return workout
  },
  remove(id: string): Promise<void> {
    return requestVoid(`/workouts/${id}`, { method: 'DELETE' })
  },
}
