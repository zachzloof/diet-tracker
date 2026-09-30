import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { isNative } from '@/lib/native'
import { useUiStore } from './ui'

/**
 * Daily "log your food" reminders (slice 5, D22). Everything is local to this device:
 * the times live in localStorage and a timer in the running app fires a notification
 * through the service worker (or falls back to an in-app toast). A web app cannot wake
 * itself when it is closed, so the settings card says so. In the native shells the
 * operating system owns the schedule (Capacitor's LocalNotifications), so reminders fire
 * with the app closed.
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

const TITLE = 'Time to log your food'
const BODY = 'Type what you ate and the app does the numbers.'

function supported(): boolean {
  return isNative || (typeof window !== 'undefined' && 'Notification' in window)
}

/** The browser's answer. Native shells start at "default" and ask the OS in `start()`. */
function permissionNow(): NotificationPermission | 'unsupported' {
  if (isNative) return 'default'
  return supported() ? Notification.permission : 'unsupported'
}

async function nativePermission(ask: boolean): Promise<NotificationPermission> {
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  const { display } = ask
    ? await LocalNotifications.requestPermissions()
    : await LocalNotifications.checkPermissions()
  return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'default'
}

/** Replaces the OS schedule with one daily notification per time; none clears it. */
async function scheduleNative(times: readonly string[]): Promise<void> {
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  const pending = await LocalNotifications.getPending()
  if (pending.notifications.length > 0) {
    await LocalNotifications.cancel({
      notifications: pending.notifications.map(({ id }) => ({ id })),
    })
  }
  if (times.length === 0) return
  await LocalNotifications.schedule({
    notifications: times.map((time, index) => {
      const [hour, minute] = time.split(':').map(Number) as [number, number]
      return { id: index + 1, title: TITLE, body: BODY, schedule: { on: { hour, minute } } }
    }),
  })
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
  /** Native schedule changes run one after another so a cancel never lands after a schedule. */
  let nativeQueue: Promise<void> = Promise.resolve()

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
    if (isNative) {
      permission.value = await nativePermission(true).catch(() => 'denied' as const)
      return permission.value
    }
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
    const title = TITLE
    const body = BODY
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
    if (isNative) {
      const times = active.value ? [...prefs.value.times] : []
      nativeQueue = nativeQueue.then(() => scheduleNative(times)).catch(() => undefined)
      return
    }
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

  async function refreshPermission(): Promise<void> {
    permission.value = isNative
      ? await nativePermission(false).catch(() => permission.value)
      : permissionNow()
  }

  /** Called once from the app root: keeps the schedule in step with the prefs and the tab. */
  function start(): void {
    watch(active, schedule, { immediate: !isNative })
    watch(() => prefs.value.times.join(','), schedule)
    // Native: the first schedule waits for the OS's answer, so a saved reminder is never
    // cancelled at launch just because the permission had not been read yet.
    if (isNative) void refreshPermission().then(schedule)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return
      if (isNative) void refreshPermission()
      else {
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
