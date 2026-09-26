import { persistQueryClient } from '@tanstack/query-persist-client-core'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { QueryClient, type Query } from '@tanstack/vue-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
})

/**
 * Offline reads (slice 5, D21): the queries a person needs to see where they stand are
 * mirrored into localStorage, so a cold start in airplane mode shows the last known day,
 * targets and week instead of a spinner. Only successful answers are kept, for a week,
 * and the whole mirror is thrown away when the app version changes. API responses are
 * never cached by the service worker; this is the one place they persist.
 */
const PERSISTED_PREFIXES: readonly (readonly string[])[] = [
  ['me'],
  ['profile'],
  ['targets'],
  ['log', 'day'],
  ['stats', 'week'],
  ['stats', 'month'],
  ['foods'],
  ['weight'],
  ['recalibration'],
]
const PERSIST_KEY = 'dt.query-cache'
const PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

function shouldPersist(query: Query): boolean {
  if (query.state.status !== 'success') return false
  const key = query.queryKey
  return PERSISTED_PREFIXES.some((prefix) => prefix.every((part, i) => key[i] === part))
}

function storage(): Storage | undefined {
  try {
    const probe = '__dt_probe__'
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return localStorage
  } catch {
    return undefined
  }
}

/** Starts mirroring and returns a promise that resolves once the last snapshot is back in memory. */
export function restorePersistedQueries(version: string): Promise<void> {
  const store = storage()
  if (!store) return Promise.resolve()
  const persister = createSyncStoragePersister({
    storage: store,
    key: PERSIST_KEY,
    throttleTime: 1000,
  })
  const [, restored] = persistQueryClient({
    queryClient,
    persister,
    maxAge: PERSIST_MAX_AGE_MS,
    buster: version,
    dehydrateOptions: { shouldDehydrateQuery: shouldPersist },
  })
  return restored.catch(() => undefined)
}

/** Drops the mirror (log out, delete account) so the next person on this device starts clean. */
export function clearPersistedQueries(): void {
  try {
    localStorage.removeItem(PERSIST_KEY)
  } catch {
    // Nothing to clear.
  }
}
