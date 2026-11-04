<script setup lang="ts">
import { MEAL_LABELS, type LogEntry } from '@diet-tracker/shared'
import { computed, ref } from 'vue'
import Card from '@/components/ui/Card.vue'
import Icon from '@/components/ui/Icon.vue'
import { ingredientCount } from '@/features/meals/meal-items'
import { ApiError } from '@/lib/api'
import { formatGrams, formatKcal, formatQuantity } from '@/lib/format'
import { useQueueStore } from '@/stores/queue'
import { useUiStore } from '@/stores/ui'
import { groupEntries, type DayLogRow, type GroupRow } from './day-groups'
import { useLocalDay } from './useLocalDay'
import { useUpdateEntry, useUpdateGroup } from './useLog'

/**
 * What the person means to eat and has not yet (D43): one list above the meals, counted in
 * nothing. The tick moves a row into the meal the time of day suggests, and tapping the row
 * opens the ordinary editor, where a different meal can be picked. A day that has not
 * happened (`planOnly`) has no tick, because nothing on it can be eaten yet.
 */
const props = defineProps<{ entries: LogEntry[]; planOnly: boolean }>()
const emit = defineEmits<{ select: [entry: LogEntry]; selectGroup: [group: GroupRow] }>()

const ui = useUiStore()
const queue = useQueueStore()
const { suggestion } = useLocalDay()
const updateEntry = useUpdateEntry()
const updateGroup = useUpdateGroup()

const rows = computed(() => groupEntries(props.entries))
const kcal = computed(() => props.entries.reduce((sum, e) => sum + e.nutrients.energy_kcal, 0))

function rowKey(row: DayLogRow): string {
  return row.kind === 'group' ? row.groupId : row.entry.id
}
function rowName(row: DayLogRow): string {
  return row.kind === 'group' ? row.name : row.entry.name
}
function rowKcal(row: DayLogRow): number {
  return row.kind === 'group' ? row.kcal : row.entry.nutrients.energy_kcal
}
function rowQueued(row: DayLogRow): boolean {
  return row.kind === 'group'
    ? row.entries.some((entry) => queue.has(entry.id))
    : queue.has(row.entry.id)
}

function select(row: DayLogRow): void {
  if (row.kind === 'group') emit('selectGroup', row)
  else emit('select', row.entry)
}

/** Rows on their way: the tick fills at once and the row leaves when the day log answers. */
const ticking = ref<string[]>([])

// `mutateAsync`, not `mutate`: the last row going unmounts this list, which would drop a
// per-call callback and the toast with it.
async function eat(row: DayLogRow): Promise<void> {
  const key = rowKey(row)
  if (ticking.value.includes(key)) return
  ticking.value = [...ticking.value, key]
  const meal = suggestion.value.meal
  const patch = { planned: false, meal }
  try {
    if (row.kind === 'group') await updateGroup.mutateAsync({ groupId: row.groupId, patch })
    else await updateEntry.mutateAsync({ id: row.entry.id, patch })
    ui.toast(`Added to ${MEAL_LABELS[meal].toLowerCase()} · ${formatKcal(rowKcal(row))}`, 'success')
  } catch (error) {
    ui.toast(error instanceof ApiError ? error.message : 'Could not save. Try again.', 'error')
  } finally {
    ticking.value = ticking.value.filter((other) => other !== key)
  }
}
</script>

<template>
  <Card :padded="false" as="section">
    <div class="px-4 pt-3 pb-1">
      <h2 class="flex items-baseline justify-between">
        <span class="text-base font-semibold text-fg">Planned</span>
        <span class="text-sm text-fg-muted">{{ formatKcal(kcal) }}</span>
      </h2>
      <p class="text-xs text-fg-muted">
        {{
          planOnly
            ? 'Nothing here counts yet. Tick it off on the day, once you have eaten it.'
            : 'Not counted yet. Tick each one once you have eaten it.'
        }}
      </p>
    </div>
    <ul class="divide-y divide-border">
      <li v-for="row in rows" :key="rowKey(row)" class="flex items-stretch">
        <!-- Waiting to send: nothing can be done to it until it has reached the server. -->
        <span
          v-if="rowQueued(row)"
          class="flex w-14 shrink-0 items-center justify-center text-fg-muted"
          aria-hidden="true"
        >
          <span class="flex size-8 items-center justify-center rounded-full bg-surface-2">
            <Icon name="clock" :size="16" />
          </span>
        </span>
        <span
          v-else-if="planOnly"
          class="flex w-14 shrink-0 items-center justify-center text-fg-muted"
          aria-hidden="true"
        >
          <span class="flex size-8 items-center justify-center rounded-full bg-surface-2">
            <Icon name="calendar" :size="16" />
          </span>
        </span>
        <button
          v-else
          type="button"
          class="group flex w-14 shrink-0 items-center justify-center disabled:opacity-50"
          :aria-label="ui.online ? `Mark ${rowName(row)} as eaten` : `Offline: ${rowName(row)}`"
          :disabled="!ui.online"
          @click="eat(row)"
        >
          <span
            class="flex size-8 items-center justify-center rounded-full border-2 transition duration-150 ease-out"
            :class="
              ticking.includes(rowKey(row))
                ? 'border-accent bg-accent text-accent-fg'
                : 'border-fg-muted/50 text-fg-muted group-hover:border-accent group-active:border-accent'
            "
          >
            <Icon name="check" :size="16" />
          </span>
        </button>

        <div
          v-if="rowQueued(row)"
          class="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2.5 pr-4 opacity-80"
          :aria-label="`${rowName(row)}, waiting to send`"
        >
          <span class="min-w-0 flex-1">
            <span class="block truncate text-base text-fg">{{ rowName(row) }}</span>
            <span class="block text-xs text-fg-muted">Waiting for a connection</span>
          </span>
          <span class="shrink-0 text-base font-semibold text-fg-muted">
            {{ formatKcal(rowKcal(row)) }}
          </span>
        </div>
        <button
          v-else
          type="button"
          class="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2.5 pr-4 text-left transition hover:bg-surface-2 active:bg-border/40"
          @click="select(row)"
        >
          <span class="min-w-0 flex-1">
            <span class="block truncate text-base text-fg">{{ rowName(row) }}</span>
            <span class="block text-xs text-fg-muted">
              <template v-if="row.kind === 'group'">
                {{ ingredientCount(row.entries.length) }}
                <template v-if="row.grams > 0"> · {{ formatGrams(row.grams) }}</template>
              </template>
              <template v-else>
                {{ formatQuantity(row.entry.quantity, row.entry.unit)
                }}<template v-if="row.entry.unit !== 'g'">
                  · {{ formatGrams(row.entry.grams) }}</template
                >
              </template>
            </span>
          </span>
          <!-- Muted, not bold: this number is not in the day's total yet. -->
          <span class="shrink-0 text-base font-semibold text-fg-muted">
            {{ formatKcal(rowKcal(row)) }}
          </span>
          <Icon name="chevron-right" :size="18" class="shrink-0 text-fg-muted" />
        </button>
      </li>
    </ul>
  </Card>
</template>
