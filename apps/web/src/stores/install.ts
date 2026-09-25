import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

const DISMISSED_KEY = 'dt.install-hint-dismissed'

function isStandaloneNow(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
}

function isIosDevice(): boolean {
  const ua = navigator.userAgent
  const iPadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return /iPhone|iPad|iPod/i.test(ua) || iPadOs
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Home-screen install state. Chrome fires `beforeinstallprompt` and lets us show a button;
 * iOS Safari has no API, so we show instructions instead.
 */
export const useInstallStore = defineStore('install', () => {
  const standalone = ref(isStandaloneNow())
  const ios = isIosDevice()
  const dismissed = ref(readDismissed())
  const prompt = ref<BeforeInstallPromptEvent | null>(null)

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    prompt.value = event
  })
  window.addEventListener('appinstalled', () => {
    standalone.value = true
    prompt.value = null
  })

  const canPrompt = computed(() => prompt.value !== null)
  const shouldHint = computed(
    () => !standalone.value && !dismissed.value && (ios || canPrompt.value),
  )

  async function install(): Promise<void> {
    const event = prompt.value
    if (!event) return
    await event.prompt()
    const { outcome } = await event.userChoice
    if (outcome === 'accepted') prompt.value = null
  }

  function dismiss(): void {
    dismissed.value = true
    try {
      localStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // Ignore: the hint will simply show again next visit.
    }
  }

  return { standalone, ios, canPrompt, shouldHint, install, dismiss }
})
