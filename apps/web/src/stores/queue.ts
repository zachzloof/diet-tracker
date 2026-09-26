import { isWaterEntry, type CreateEntriesRequest, type LogEntry } from '@diet-tracker/shared'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ME_KEY } from '@/features/auth/useSession'
import { logApi } from '@/features/log/api'
import { FOODS_KEY, dayKey } from '@/features/log/keys'
import { STATS_KEY } from '@/features/stats/useStats'
import { ApiError } from '@/lib/api'
import { queryClient } from '@/lib/query-client'
import { useUiStore } from './ui'

/**
 * Queued log writes (slice 5, D21). A meal or a glass of water added while offline (or
 * when the request could not reach the server) waits here, in localStorage, and is sent
 * in order as soon as the connection is back. Until then the day log shows the queued
 * entries as pending, with their numbers already counted.
 */

export interface QueuedWrite {
  id: string
  userId: string
  request: CreateEntriesRequest
  /** The entries as they will look once saved, for the day log and totals. */
  entries: LogEntry[]
  createdAt: string
}

const STORAGE_KEY = 'dt.queue'

function readQueue(): QueuedWrite[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as QueuedWrite[]) : []
  } catch {
    return []
  }
}

function writeQueue(items: QueuedWrite[]): void {
  try {
    if (items.length === 0) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Storage full or blocked: the queue still works for this session.
  }
}

function newId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`
}

function currentUserId(): string {
  const user = queryClient.getQueryData<{ id: string } | null>(ME_KEY)
  return user?.id ?? 'anonymous'
}

export const useQueueStore = defineStore('queue', () => {
  const items = ref<QueuedWrite[]>(readQueue())
  const flushing = ref(false)

  const pendingIds = computed(() => {
    const ids = new Set<string>()
    for (const item of items.value) for (const entry of item.entries) ids.add(entry.id)
    return ids
  })

  function mine(): QueuedWrite[] {
    const userId = currentUserId()
    return items.value.filter((item) => item.userId === userId)
  }

  /** Queued entries for one day, in the order they were added. */
  function pendingFor(day: string): LogEntry[] {
    return mine()
      .filter((item) => item.request.day === day)
      .flatMap((item) => item.entries)
  }

  /** Queued meals (not water) for the current person, for the "waiting to send" line. */
  const pendingMeals = computed(() => {
    const userId = currentUserId()
    return items.value.filter(
      (item) => item.userId === userId && item.entries.some((entry) => !isWaterEntry(entry)),
    ).length
  })

  function enqueue(request: CreateEntriesRequest): QueuedWrite {
    const now = new Date().toISOString()
    const item: QueuedWrite = {
      id: newId(),
      userId: currentUserId(),
      request,
      createdAt: now,
      entries: request.entries.map((entry) => ({
        id: newId(),
        day: request.day,
        loggedAt: request.loggedAt,
        meal: request.meal,
        name: entry.name,
        quantity: entry.quantity,
        unit: entry.unit,
        grams: entry.grams,
        nutrients: entry.nutrients,
        foodGroups: entry.foodGroups,
        source: entry.source,
        foodId: entry.foodId,
        aiCallId: entry.aiCallId,
        assumptions: entry.assumptions,
        confidence: entry.confidence,
        createdAt: now,
        updatedAt: now,
      })),
    }
    items.value = [...items.value, item]
    writeQueue(items.value)
    return item
  }

  function has(entryId: string): boolean {
    return pendingIds.value.has(entryId)
  }

  /** Removes one queued entry (a glass of water undone before it was sent). */
  function removeEntry(entryId: string): void {
    const item = items.value.find((candidate) => candidate.entries.some((e) => e.id === entryId))
    if (!item) return
    const index = item.entries.findIndex((e) => e.id === entryId)
    const request: CreateEntriesRequest = {
      ...item.request,
      entries: item.request.entries.filter((_, i) => i !== index),
    }
    const entries = item.entries.filter((e) => e.id !== entryId)
    items.value =
      entries.length === 0
        ? items.value.filter((candidate) => candidate.id !== item.id)
        : items.value.map((candidate) =>
            candidate.id === item.id ? { ...candidate, request, entries } : candidate,
          )
    writeQueue(items.value)
  }

  function remove(id: string): void {
    items.value = items.value.filter((item) => item.id !== id)
    writeQueue(items.value)
  }

  /** Sends the queue in order. Stops at the first network failure; drops a rejected item. */
  async function flush(): Promise<void> {
    if (flushing.value || !navigator.onLine) return
    flushing.value = true
    const ui = useUiStore()
    const touched = new Set<string>()
    let sent = 0
    try {
      for (const item of mine()) {
        try {
          await logApi.createEntries(item.request)
          remove(item.id)
          touched.add(item.request.day)
          sent += 1
        } catch (error) {
          if (error instanceof ApiError && error.isNetwork) break
          remove(item.id)
          ui.toast(
            `One queued entry (${item.entries[0]?.name ?? 'food'}) could not be saved: ${error instanceof Error ? error.message : 'unknown error'}`,
            'error',
          )
        }
      }
    } finally {
      flushing.value = false
    }
    if (touched.size > 0) {
      await Promise.all([
        ...[...touched].map((day) => queryClient.invalidateQueries({ queryKey: dayKey(day) })),
        queryClient.invalidateQueries({ queryKey: STATS_KEY }),
        queryClient.invalidateQueries({ queryKey: FOODS_KEY }),
      ])
      if (sent > 0) ui.toast(`Sent ${sent} queued ${sent === 1 ? 'entry' : 'entries'}`, 'success')
    }
  }

  return { items, flushing, pendingMeals, pendingFor, enqueue, has, removeEntry, remove, flush }
})
