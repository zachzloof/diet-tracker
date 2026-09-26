import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useUiStore } from './ui'

/**
 * Daily "log your food" reminders (slice 5, D22). Everything is local to this device:
 * the times live in localStorage and a timer in the running app fires a notification
 * through the service worker (or falls back to an in-app toast). A web app cannot wake
 * itself when it is closed, so the settings card says so; Capacitor's LocalNotifications
 * plugin takes over in the native shell.
 */

export interface ReminderPrefs {
  enabled: boolean
  /** "HH:MM" in the device's local time. */
  times: string[]
}

const STORAGE_KEY = 'dt.reminders'
const FIRED_KEY = 'dt.reminders.last'
const DEFAULT_TIMES = ['12:30', '19:30']
export const MAX_REMINDERS = 3
/** Timers drift when a tab is in the background; re-arm at most this far ahead. */
const MAX_TIMER_MS = 6 * 60 * 60 * 1000

function readPrefs(): ReminderPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { enabled: false, times: [...DEFAULT_TIMES] }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) throw new Error('bad prefs')
    const enabled = Reflect.get(parsed, 'enabled') === true
    const timesRaw: unknown = Reflect.get(parsed, 'times')
    const times = Array.isArray(timesRaw)
      ? timesRaw.filter((t): t is string => typeof t === 'string' && /^\d{2}:\d{2}$/.test(t))
      : [...DEFAULT_TIMES]
    return { enabled, times: times.slice(0, MAX_REMINDERS) }
  } catch {
    return { enabled: false, times: [...DEFAULT_TIMES] }
  }
}

function supported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

function permissionNow(): NotificationPermission | 'unsupported' {
  return supported() ? Notification.permission : 'unsupported'
}

/** The next instant at or after `from` that matches one of the times. */
export function nextOccurrence(times: readonly string[], from: Date): Date | null {
  let best: Date | null = null
  for (const time of times) {
    const [h, m] = time.split(':').map(Number) as [number, number]
    for (const dayOffset of [0, 1]) {
      const candidate = new Date(from)
      candidate.setDate(candidate.getDate() + dayOffset)
      candidate.setHours(h, m, 0, 0)
      if (candidate.getTime() > from.getTime() && (!best || candidate < best)) best = candidate
    }
  }
  return best
}

function slotKey(at: Date): string {
  return `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}T${at.getHours()}:${at.getMinutes()}`
}

export const useRemindersStore = defineStore('reminders', () => {
  const prefs = ref<ReminderPrefs>(readPrefs())
  const permission = ref(permissionNow())
  const isSupported = supported()
  let timer: number | null = null

  const active = computed(
    () => prefs.value.enabled && prefs.value.times.length > 0 && permission.value === 'granted',
  )
  const next = computed(() => (active.value ? nextOccurrence(prefs.value.times, new Date()) : null))

  function save(next: ReminderPrefs): void {
    prefs.value = next
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // The choice just will not persist.
    }
  }

  async function requestPermission(): Promise<NotificationPermission | 'unsupported'> {
    if (!isSupported) return 'unsupported'
    try {
      permission.value = await Notification.requestPermission()
    } catch {
      permission.value = Notification.permission
    }
    return permission.value
  }

  async function setEnabled(enabled: boolean): Promise<void> {
    if (enabled && permission.value !== 'granted') {
      const result = await requestPermission()
      if (result !== 'granted') {
        save({ ...prefs.value, enabled: false })
        return
      }
    }
    save({ ...prefs.value, enabled })
  }

  function setTimes(times: string[]): void {
    const clean = [...new Set(times.filter((t) => /^\d{2}:\d{2}$/.test(t)))]
      .sort()
      .slice(0, MAX_REMINDERS)
    save({ ...prefs.value, times: clean })
  }

  async function notify(at: Date): Promise<void> {
    const key = slotKey(at)
    try {
      if (localStorage.getItem(FIRED_KEY) === key) return
      localStorage.setItem(FIRED_KEY, key)
    } catch {
      // Fire anyway.
    }
    const title = 'Time to log your food'
    const body = 'Type what you ate and the app does the numbers.'
    try {
      const registration = await navigator.serviceWorker?.ready
      if (registration && 'showNotification' in registration) {
        await registration.showNotification(title, {
          body,
          tag: 'dt-reminder',
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-96.png',
        })
        return
      }
    } catch {
      // Fall through to the page-level API.
    }
    try {
      new Notification(title, { body, tag: 'dt-reminder', icon: '/icons/icon-192.png' })
    } catch {
      useUiStore().toast(title, 'info')
    }
  }

  function schedule(): void {
    if (timer !== null) {
      window.clearTimeout(timer)
      timer = null
    }
    if (!active.value) return
    const now = new Date()
    const at = nextOccurrence(prefs.value.times, now)
    if (!at) return
    const delay = Math.min(at.getTime() - now.getTime(), MAX_TIMER_MS)
    timer = window.setTimeout(() => {
      timer = null
      if (Date.now() >= at.getTime() - 1000) void notify(at)
      schedule()
    }, delay)
  }

  /** Called once from the app root: keeps the timer in step with the prefs and the tab. */
  function start(): void {
    watch(active, schedule, { immediate: true })
    watch(() => prefs.value.times.join(','), schedule)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        permission.value = permissionNow()
        schedule()
      }
    })
  }

  return {
    prefs,
    permission,
    isSupported,
    active,
    next,
    setEnabled,
    setTimes,
    requestPermission,
    start,
  }
})
