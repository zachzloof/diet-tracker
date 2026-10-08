<script setup lang="ts">
import { MEAL_LABELS, type LogEntry } from '@diet-tracker/shared'
import { computed } from 'vue'
import Card from '@/components/ui/Card.vue'
import Icon, { type IconName } from '@/components/ui/Icon.vue'
import { ingredientCount } from '@/features/meals/meal-items'
import { formatGrams, formatKcal, formatQuantity } from '@/lib/format'
import { useQueueStore } from '@/stores/queue'
import { mealSections, type GroupRow } from './day-groups'

/**
 * The day's food entries grouped by meal, each with a kcal subtotal. Ingredients logged
 * together as one meal ("Protein oats") show as one row with the meal's total; tap it to see
 * and edit the ingredients. Tap any other row to edit it. Water quick-adds live in the water
 * card. Entries waiting in the offline queue are shown in place with a clock and cannot be
 * edited until they have been sent.
 */
const props = defineProps<{ entries: LogEntry[] }>()
const emit = defineEmits<{ select: [entry: LogEntry]; selectGroup: [group: GroupRow] }>()
const queue = useQueueStore()

const sections = computed(() => mealSections(props.entries))

function groupQueued(group: GroupRow): boolean {
  return group.entries.some((entry) => queue.has(entry.id))
}

const SOURCE_ICON: Record<LogEntry['source'], IconName> = {
  ai: 'sparkles',
  library: 'book',
  manual: 'pencil',
}
const SOURCE_LABEL: Record<LogEntry['source'], string> = {
  ai: 'AI estimate',
  library: 'From My foods',
  manual: 'Entered manually',
}
const CONFIDENCE_DOT: Record<NonNullable<LogEntry['confidence']>, string> = {
  high: 'bg-met',
  medium: 'bg-close',
  low: 'bg-short',
}
</script>

<template>
  <div class="space-y-4">
    <Card v-for="section in sections" :key="section.meal" :padded="false" as="section">
      <h2 class="flex items-baseline justify-between px-4 pt-3 pb-1">
        <span class="text-base font-semibold text-fg">{{ MEAL_LABELS[section.meal] }}</span>
        <span class="text-sm text-fg-muted">{{ formatKcal(section.kcal) }}</span>
      </h2>
      <ul class="divide-y divide-border">
        <template v-for="row in section.rows">
          <!-- A logged meal: one row for all its ingredients. -->
          <li v-if="row.kind === 'group'" :key="row.groupId">
            <div
              v-if="groupQueued(row)"
              class="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left opacity-80"
              :aria-label="`${row.name}, waiting to send`"
            >
              <span
                class="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-muted"
                aria-hidden="true"
              >
                <Icon name="clock" :size="16" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-base text-fg">{{ row.name }}</span>
                <span class="block text-xs text-fg-muted">
                  {{ ingredientCount(row.entries.length) }} · waiting for a connection
                </span>
              </span>
              <span class="shrink-0 text-base font-semibold text-fg">
                {{ formatKcal(row.kcal) }}
              </span>
            </div>
            <button
              v-else
              type="button"
              class="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-surface-2 active:bg-border/40"
              @click="emit('selectGroup', row)"
            >
              <span
                class="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent"
                title="Logged meal"
                aria-hidden="true"
              >
                <Icon name="utensils" :size="16" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-base text-fg">{{ row.name }}</span>
                <span class="block text-xs text-fg-muted">
                  {{ ingredientCount(row.entries.length) }}
                  <template v-if="row.grams > 0"> · {{ formatGrams(row.grams) }}</template>
                </span>
              </span>
              <span class="shrink-0 text-base font-semibold text-fg">
                {{ formatKcal(row.kcal) }}
              </span>
              <Icon name="chevron-right" :size="18" class="shrink-0 text-fg-muted" />
            </button>
          </li>

          <li v-else :key="row.entry.id">
            <div
              v-if="queue.has(row.entry.id)"
              class="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left opacity-80"
              :aria-label="`${row.entry.name}, waiting to send`"
            >
              <span
                class="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-muted"
                aria-hidden="true"
              >
                <Icon name="clock" :size="16" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-base text-fg">{{ row.entry.name }}</span>
                <span class="block text-xs text-fg-muted">
                  {{ formatQuantity(row.entry.quantity, row.entry.unit) }} · waiting for a
                  connection
                </span>
              </span>
              <span class="shrink-0 text-base font-semibold text-fg">
                {{ formatKcal(row.entry.nutrients.energy_kcal) }}
              </span>
            </div>
            <button
              v-else
              type="button"
              class="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-surface-2 active:bg-border/40"
              @click="emit('select', row.entry)"
            >
              <span
                class="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-muted"
                :title="SOURCE_LABEL[row.entry.source]"
                aria-hidden="true"
              >
                <Icon :name="SOURCE_ICON[row.entry.source]" :size="16" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-base text-fg">{{ row.entry.name }}</span>
                <span class="flex items-center gap-1.5 text-xs text-fg-muted">
                  <span
                    v-if="row.entry.confidence"
                    class="inline-block size-1.5 rounded-full"
                    :class="CONFIDENCE_DOT[row.entry.confidence]"
                    :aria-label="`${row.entry.confidence} confidence`"
                  />
                  {{ formatQuantity(row.entry.quantity, row.entry.unit)
                  }}<template v-if="row.entry.unit !== 'g'">
                    · {{ formatGrams(row.entry.grams) }}</template
                  >
                </span>
              </span>
              <span class="shrink-0 text-base font-semibold text-fg">
                {{ formatKcal(row.entry.nutrients.energy_kcal) }}
              </span>
              <Icon name="chevron-right" :size="18" class="shrink-0 text-fg-muted" />
            </button>
          </li>
        </template>
      </ul>
    </Card>
  </div>
</template>
