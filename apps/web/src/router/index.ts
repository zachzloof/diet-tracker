import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { meQueryOptions } from '@/features/auth/useSession'
import { queryClient } from '@/lib/query-client'

declare module 'vue-router' {
  interface RouteMeta {
    /** Reachable without a session (login, register). */
    public?: boolean
  }
}

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'today', component: () => import('@/features/today/TodayScreen.vue') },
  { path: '/week', name: 'week', component: () => import('@/features/week/WeekScreen.vue') },
  { path: '/you', name: 'you', component: () => import('@/features/you/YouScreen.vue') },
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
 * Auth guard. The session is fetched once and cached; `undefined` means we could not
 * ask the server (offline), in which case navigation proceeds and screens show the error.
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
  return true
})
