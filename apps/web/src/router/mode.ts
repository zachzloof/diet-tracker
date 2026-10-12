import type { RouteLocationNormalizedLoaded, RouteLocationRaw } from 'vue-router'
import type { AppMode } from '@/stores/ui'

/**
 * The two halves of the app (D38) mirror each other screen for screen: Today, a list
 * (Meals or Workouts), Week. The switch at the top of a root screen lands on the matching
 * screen of the other half; from a shared screen (You) it only changes the tab bar.
 */
const COUNTERPART: Readonly<Record<AppMode, Readonly<Record<string, string>>>> = {
  training: {
    today: 'gym-today',
    day: 'gym-day',
    week: 'gym-week',
    meals: 'workouts',
  },
  diet: {
    'gym-today': 'today',
    'gym-day': 'day',
    'gym-week': 'week',
    workouts: 'meals',
  },
}

/** Where the switch goes from `route` when flipping to `mode`; null means stay put. */
export function counterpartRoute(
  route: Pick<RouteLocationNormalizedLoaded, 'name' | 'params'>,
  mode: AppMode,
): RouteLocationRaw | null {
  const name = typeof route.name === 'string' ? COUNTERPART[mode][route.name] : undefined
  if (!name) return null
  return { name, params: route.params }
}
