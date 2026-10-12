import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { isNative } from '@/lib/native'

export type ThemePreference = 'system' | 'dark' | 'light'
/** The two halves of the app (D38): food and the gym. Each has its own tabs. */
export type AppMode = 'diet' | 'training'
export type ToastKind = 'info' | 'success' | 'error'

export interface ToastItem {
  id: number
  message: string
  kind: ToastKind
}

const THEME_KEY = 'dt.theme'
const MODE_KEY = 'dt.mode'
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

/** The remembered half of the app; the router reads it before any store exists. */
export function readStoredMode(): AppMode {
  try {
    const stored = localStorage.getItem(MODE_KEY)
    if (stored === 'diet' || stored === 'training') return stored
  } catch {
    // Private mode or blocked storage: fall through to the default.
  }
  return 'diet'
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
  if (isNative) void applyStatusBar(effective)
}

/** Native shells: light status bar text on the dark theme, dark text on the light one. */
async function applyStatusBar(effective: 'dark' | 'light'): Promise<void> {
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setStyle({ style: effective === 'dark' ? Style.Dark : Style.Light })
  } catch {
    // The system default follows the phone's own light or dark setting.
  }
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

  /**
   * Which half of the app the person is in. Routes under the gym set it as they open, the
   * shared screens (You, Settings) read it for their tab bar, and it is remembered so the
   * bookmark reopens where they left off.
   */
  const mode = ref<AppMode>(readStoredMode())
  function setMode(next: AppMode): void {
    if (mode.value === next) return
    mode.value = next
    try {
      localStorage.setItem(MODE_KEY, next)
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
    mode,
    setMode,
    toasts,
    toast,
    dismissToast,
    online,
    quickAdd,
    openQuickAdd,
    closeQuickAdd,
  }
})
