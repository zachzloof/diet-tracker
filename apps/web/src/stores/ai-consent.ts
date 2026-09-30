import type { PublicUser } from '@diet-tracker/shared'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ME_KEY } from '@/features/auth/useSession'
import { queryClient } from '@/lib/query-client'

/**
 * Permission to send data to the AI provider (D25). Nothing reaches OpenAI until the
 * person says yes: the estimate, the plan explanation and the weekly review all check
 * `granted` first and show `AiConsent.vue` instead. The answer is kept on this device
 * against the account that gave it, so the next person to sign in here is asked again.
 */
const STORAGE_KEY = 'dt.ai-consent'

function readOwner(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export const useAiConsentStore = defineStore('aiConsent', () => {
  const owner = ref<string | null>(readOwner())
  const granted = computed(() => owner.value !== null)

  function save(next: string | null): void {
    owner.value = next
    try {
      if (next === null) localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // The answer just will not persist past this visit.
    }
  }

  function grant(): void {
    const user = queryClient.getQueryData<PublicUser | null>(ME_KEY)
    if (user) save(user.id)
  }

  function revoke(): void {
    save(null)
  }

  /** Called on sign-in: a yes given by another account on this device does not carry over. */
  function syncUser(userId: string): void {
    if (owner.value !== null && owner.value !== userId) save(null)
  }

  return { granted, grant, revoke, syncUser }
})
