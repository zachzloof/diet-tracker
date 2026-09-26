import type { Profile } from '@diet-tracker/shared'
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { meQueryOptions } from '@/features/auth/useSession'
import { profileQueryOptions } from '@/features/profile/useProfile'
import { queryClient } from '@/lib/query-client'

declare module 'vue-router' {
  interface RouteMeta {
    /** Reachable without a session (login, register). */
    public?: boolean
    /** Reachable before onboarding is complete. */
    preOnboarding?: boolean
  }
}

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'today', component: () => import('@/features/today/TodayScreen.vue') },
  { path: '/week', name: 'week', component: () => import('@/features/week/WeekScreen.vue') },
  { path: '/you', name: 'you', component: () => import('@/features/you/YouScreen.vue') },
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
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

/**
 * Auth and onboarding guard. Both lookups are cached; `undefined` means the server could
 * not be reached (offline), in which case navigation proceeds and screens show the error.
 */
router.beforeEach(async (to) => {
  let user: Awaited<ReturnType<typeof queryClient.ensureQueryData>> | undefined
  try {
    user = await queryClient.ensureQueryData(meQueryOptions())
  } catch {
    user = undefined
  }

  if (to.meta.public) {
    return user ? { name: 'today' } : true
  }
  if (user === null) {
    return { name: 'login', query: to.fullPath === '/' ? {} : { next: to.fullPath } }
  }
  if (user === undefined) return true

  let profile: Profile | null | undefined
  try {
    profile = await queryClient.ensureQueryData(profileQueryOptions())
  } catch {
    profile = undefined
  }
  if (profile === null && !to.meta.preOnboarding) return { name: 'onboarding' }
  if (profile && to.name === 'onboarding') return { name: 'today' }
  return true
})
