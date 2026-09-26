/** Query keys for the log and the foods library, shared by the composables and the offline queue. */
export const LOG_KEY = ['log'] as const
export const dayKey = (day: string) => ['log', 'day', day] as const
export const FOODS_KEY = ['foods'] as const
export const foodsKey = (q: string) => ['foods', q] as const
