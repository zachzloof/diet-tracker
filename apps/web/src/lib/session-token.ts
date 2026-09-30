import { isNative } from './native'

/**
 * The session token of the native shells (D23). A browser never sees its token: it lives
 * in an HttpOnly cookie. Inside Capacitor the cookie is not sent, so the token from login
 * is kept in the Keychain (iOS) or the Keystore (Android) and sent as a bearer header.
 */
const STORAGE_KEY = 'session-token'

let token: string | null = null

export function sessionToken(): string | null {
  return token
}

/** Called once at boot, before the first request. Does nothing in a browser. */
export async function loadSessionToken(): Promise<void> {
  if (!isNative) return
  try {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
    const stored = await SecureStorage.get(STORAGE_KEY)
    token = typeof stored === 'string' && stored.length > 0 ? stored : null
  } catch {
    token = null
  }
}

/** Remembers the token from login or register; `null` forgets it (sign out, 401, deletion). */
export async function saveSessionToken(next: string | null): Promise<void> {
  token = next
  if (!isNative) return
  try {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
    if (next === null) await SecureStorage.remove(STORAGE_KEY)
    else await SecureStorage.set(STORAGE_KEY, next)
  } catch {
    // The token still works until the app is closed; the next launch asks to sign in.
  }
}
