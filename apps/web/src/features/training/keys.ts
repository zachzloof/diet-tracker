/** Query keys for exercises and workouts, shared by the composables, the draft store and the offline mirror. */
export const EXERCISES_KEY = ['exercises'] as const
export const WORKOUTS_KEY = ['workouts'] as const
export const workoutsRangeKey = (from: string, to: string) =>
  [...WORKOUTS_KEY, 'range', from, to] as const
export const workoutKey = (id: string) => [...WORKOUTS_KEY, 'one', id] as const
export const exerciseHistoryKey = (exerciseId: string, limit: number) =>
  [...EXERCISES_KEY, 'history', exerciseId, limit] as const
