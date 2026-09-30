import { Capacitor } from '@capacitor/core'

/** True inside the iOS or Android shell (Capacitor); false in a browser or an installed PWA. */
export const isNative = Capacitor.isNativePlatform()

/**
 * Where the API lives. Empty in the browser, where the API is same-origin. The native
 * build sets `VITE_API_ORIGIN` because its bundle runs on `capacitor://localhost` (D23).
 */
export const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN ?? '').replace(/\/+$/, '')
