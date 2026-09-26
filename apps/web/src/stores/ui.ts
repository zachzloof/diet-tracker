import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type ThemePreference = 'system' | 'dark' | 'light'
export type ToastKind = 'info' | 'success' | 'error'

export interface ToastItem {
  id: number
  message: string
  kind: ToastKind
}

const THEME_KEY = 'dt.theme'
const THEME_COLORS = { dark: '#0c0f14', light: '#f7f8fa' } as const

function readTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'dark' || stored === 'light' || stored === 'system') return stored
  } catch {
    // Private mode or blocked storage: fall through to the default.
  }
  return 'system'
}

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

function applyTheme(theme: ThemePreference): void {
  const root = document.documentElement
  if (theme === 'system') delete root.dataset.theme
  else root.dataset.theme = theme
  const effective = theme === 'system' ? (darkQuery.matches ? 'dark' : 'light') : theme
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLORS[effective])
}

/** Theme, toasts and connectivity: client-only state shared by every screen. */
export const useUiStore = defineStore('ui', () => {
  const theme = ref<ThemePreference>(readTheme())
  watch(theme, applyTheme, { immediate: true })
  darkQuery.addEventListener('change', () => applyTheme(theme.value))

  function setTheme(next: ThemePreference): void {
    theme.value = next
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      // Ignore: the choice just will not persist.
    }
  }

  const toasts = ref<ToastItem[]>([])
  let nextToastId = 1

  function toast(message: string, kind: ToastKind = 'info'): void {
    const id = nextToastId++
    toasts.value.push({ id, message, kind })
    window.setTimeout(() => dismissToast(id), 4000)
  }

  function dismissToast(id: number): void {
    toasts.value = toasts.value.filter((item) => item.id !== id)
  }

  /** The quick-add sheet is opened from the tab bar or any screen; `day` presets the log day. */
  const quickAdd = ref<{ open: boolean; day: string | null }>({ open: false, day: null })
  function openQuickAdd(day: string | null = null): void {
    quickAdd.value = { open: true, day }
  }
  function closeQuickAdd(): void {
    quickAdd.value = { open: false, day: null }
  }

  const online = ref(navigator.onLine)
  window.addEventListener('online', () => (online.value = true))
  window.addEventListener('offline', () => (online.value = false))

  return {
    theme,
    setTheme,
    toasts,
    toast,
    dismissToast,
    online,
    quickAdd,
    openQuickAdd,
    closeQuickAdd,
  }
})
