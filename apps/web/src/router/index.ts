import type { Profile } from '@diet-tracker/shared'
import { START_LOCATION, createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { meQueryOptions } from '@/features/auth/useSession'
import { profileQueryOptions } from '@/features/profile/useProfile'
import { queryClient } from '@/lib/query-client'
import { readStoredMode, useUiStore, type AppMode } from '@/stores/ui'

declare module 'vue-router' {
  interface RouteMeta {
    /** Reachable without a session (login, register); a signed-in visit goes to Today. */
    public?: boolean
    /** Reachable by anyone, signed in or not, with no lookups (privacy, terms). */
    open?: boolean
    /** Reachable before onboarding is complete. */
    preOnboarding?: boolean
    /**
     * Which half of the app the screen belongs to (D38). Opening it sets the mode; gym
     * screens redirect to Today while workouts are switched off in Preferences.
     */
    mode?: AppMode
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'today',
    component: () => import('@/features/today/TodayScreen.vue'),
    meta: { mode: 'diet' },
  },
  {
    path: '/day/:day',
    name: 'day',
    component: () => import('@/features/today/TodayScreen.vue'),
    meta: { mode: 'diet' },
  },
  {
    path: '/week',
    name: 'week',
    component: () => import('@/features/week/WeekScreen.vue'),
    meta: { mode: 'diet' },
  },
  {
    path: '/history',
    name: 'history',
    component: () => import('@/features/history/HistoryScreen.vue'),
  },
  {
    path: '/progress',
    name: 'progress',
    component: () => import('@/features/progress/ProgressScreen.vue'),
  },
  { path: '/you', name: 'you', component: () => import('@/features/you/YouScreen.vue') },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/features/settings/SettingsScreen.vue'),
  },
  {
    path: '/settings/preferences',
    name: 'preferences',
    component: () => import('@/features/settings/PreferencesScreen.vue'),
  },
  {
    path: '/onboarding',
    name: 'onboarding',
    component: () => import('@/features/onboarding/OnboardingScreen.vue'),
    meta: { preOnboarding: true },
  },
  {
    path: '/targets',
    name: 'targets',
    component: () => import('@/features/targets/TargetsScreen.vue'),
  },
  {
    path: '/targets/history',
    name: 'targets-history',
    component: () => import('@/features/targets/TargetsHistoryScreen.vue'),
  },
  {
    path: '/foods',
    name: 'foods',
    component: () => import('@/features/log/FoodsScreen.vue'),
    meta: { mode: 'diet' },
  },
  {
    path: '/meals',
    name: 'meals',
    component: () => import('@/features/meals/MealsScreen.vue'),
    meta: { mode: 'diet' },
  },
  {
    path: '/meals/new',
    name: 'meal-new',
    component: () => import('@/features/meals/MealEditorScreen.vue'),
    meta: { mode: 'diet' },
  },
  {
    path: '/meals/:id',
    name: 'meal-edit',
    component: () => import('@/features/meals/MealEditorScreen.vue'),
    meta: { mode: 'diet' },
  },
  // The gym half (D38): its own Today, Workouts and Week, mirroring the food half.
  {
    path: '/gym',
    name: 'gym-today',
    component: () => import('@/features/training/TrainingTodayScreen.vue'),
    meta: { mode: 'training' },
  },
  {
    path: '/gym/day/:day',
    name: 'gym-day',
    component: () => import('@/features/training/TrainingTodayScreen.vue'),
    meta: { mode: 'training' },
  },
  {
    path: '/gym/week',
    name: 'gym-week',
    component: () => import('@/features/training/TrainingWeekScreen.vue'),
    meta: { mode: 'training' },
  },
  {
    path: '/gym/lifts',
    name: 'lifts',
    component: () => import('@/features/training/LiftsScreen.vue'),
    meta: { mode: 'training' },
  },
  {
    path: '/gym/lifts/:id',
    name: 'lift',
    component: () => import('@/features/training/LiftScreen.vue'),
    meta: { mode: 'training' },
  },
  {
    path: '/workouts',
    name: 'workouts',
    component: () => import('@/features/training/WorkoutsScreen.vue'),
    meta: { mode: 'training' },
  },
  {
    path: '/workouts/new',
    name: 'workout-new',
    component: () => import('@/features/training/WorkoutStartScreen.vue'),
    meta: { mode: 'training' },
  },
  {
    path: '/workouts/:id',
    name: 'workout',
    component: () => import('@/features/training/WorkoutScreen.vue'),
    meta: { mode: 'training' },
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('@/features/profile/ProfileScreen.vue'),
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/features/auth/LoginScreen.vue'),
    meta: { public: true },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/features/auth/RegisterScreen.vue'),
    meta: { public: true },
  },
  {
    path: '/privacy',
    name: 'privacy',
    component: () => import('@/features/legal/PrivacyScreen.vue'),
    meta: { open: true },
  },
  {
    path: '/terms',
    name: 'terms',
    component: () => import('@/features/legal/TermsScreen.vue'),
    meta: { open: true },
  },
  {
    path: '/sources',
    name: 'sources',
    component: () => import('@/features/legal/SourcesScreen.vue'),
    meta: { open: true },
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

/**
 * Auth and onboarding guard. Both lookups are cached (and mirrored to localStorage, so
 * they answer offline); `undefined` means the server could not be reached and nothing was
 * cached, in which case navigation proceeds and screens show the error.
 */
router.beforeEach(async (to, from) => {
  if (to.meta.open) return true

  // Both lookups go out at once: on a slow network each round trip costs more than the
  // render, and the first paint of every screen waits on this guard.
  const [userResult, profileResult] = await Promise.allSettled([
    queryClient.ensureQueryData(meQueryOptions()),
    to.meta.public ? Promise.resolve(null) : queryClient.ensureQueryData(profileQueryOptions()),
  ])
  const user = userResult.status === 'fulfilled' ? userResult.value : undefined

  if (to.meta.public) {
    return user ? { name: 'today' } : true
  }
  if (user === null) {
    return { name: 'login', query: to.fullPath === '/' ? {} : { next: to.fullPath } }
  }
  if (user === undefined) return true

  const profile: Profile | null | undefined =
    profileResult.status === 'fulfilled' ? profileResult.value : undefined
  if (profile === null && !to.meta.preOnboarding) return { name: 'onboarding' }
  if (profile && to.name === 'onboarding') return { name: 'today' }

  // The gym half (D38) only exists while workouts are on; off, its screens go to Today.
  const workoutsOn = profile?.preferences.workouts ?? true
  if (to.meta.mode === 'training' && !workoutsOn) return { name: 'today' }
  // The bookmark opens `/`; a person who left the app in the gym comes back to the gym.
  if (from === START_LOCATION && to.path === '/' && workoutsOn && readStoredMode() === 'training') {
    return { name: 'gym-today' }
  }
  return true
})

// A screen that belongs to one half of the app puts the tab bar in that half.
router.afterEach((to) => {
  if (to.meta.mode) useUiStore().setMode(to.meta.mode)
})
