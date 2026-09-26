import { localDay, suggestDayAndMeal } from '@diet-tracker/shared'
import { computed, onScopeDispose, ref } from 'vue'
import { useProfile } from '@/features/profile/useProfile'

/**
 * "Today" is the user's local day in their profile time zone, never the device's or the
 * server's (CLAUDE.md non-negotiable 5). Ticks every 30 s so midnight rolls the day over.
 */
export function useLocalDay() {
  const profile = useProfile()
  const now = ref(new Date())
  const timer = window.setInterval(() => (now.value = new Date()), 30_000)
  onScopeDispose(() => window.clearInterval(timer))

  const timeZone = computed(() => profile.profile.value?.timezone ?? 'UTC')
  const today = computed(() => localDay(now.value, timeZone.value))
  const suggestion = computed(() => suggestDayAndMeal(now.value, timeZone.value))

  return { now, timeZone, today, suggestion }
}
