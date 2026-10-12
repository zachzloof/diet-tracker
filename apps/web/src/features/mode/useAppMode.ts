import { computed, type ComputedRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePreferences } from '@/features/profile/usePreferences'
import { counterpartRoute } from '@/router/mode'
import { useUiStore, type AppMode } from '@/stores/ui'

/**
 * Which half of the app is showing (D38). The remembered choice only counts while the
 * gym is switched on in Preferences; off, everything is the food half and the switch is
 * hidden. `switchTo` flips the tab bar and lands on the matching screen of the other half.
 */
export function useAppMode(): {
  mode: ComputedRef<AppMode>
  available: ComputedRef<boolean>
  switchTo: (mode: AppMode) => void
} {
  const ui = useUiStore()
  const prefs = usePreferences()
  const route = useRoute()
  const router = useRouter()

  const available = computed(() => prefs.value.workouts)
  const mode = computed<AppMode>(() => (available.value ? ui.mode : 'diet'))

  function switchTo(next: AppMode): void {
    if (next === mode.value) return
    ui.setMode(next)
    const target = counterpartRoute(route, next)
    if (target) void router.replace(target)
  }

  return { mode, available, switchTo }
}
