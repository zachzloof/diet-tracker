<script setup lang="ts">
import { MEALS, MEAL_LABELS, isWaterEntry, type LogEntry, type Meal } from '@diet-tracker/shared'
import { computed } from 'vue'
import Card from '@/components/ui/Card.vue'
import Icon, { type IconName } from '@/components/ui/Icon.vue'
import { formatGrams, formatKcal, formatQuantity } from '@/lib/format'

/** The day's food entries grouped by meal, each with a kcal subtotal. Tap a row to edit it. Water quick-adds live in the water card. */
const props = defineProps<{ entries: LogEntry[] }>()
const emit = defineEmits<{ select: [entry: LogEntry] }>()

const groups = computed(() =>
  MEALS.map((meal: Meal) => {
    const entries = props.entries.filter((entry) => entry.meal === meal && !isWaterEntry(entry))
    return {
      meal,
      entries,
      kcal: entries.reduce((sum, entry) => sum + entry.nutrients.energy_kcal, 0),
    }
  }).filter((group) => group.entries.length > 0),
)

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
    <Card v-for="group in groups" :key="group.meal" :padded="false" as="section">
      <h2 class="flex items-baseline justify-between px-4 pt-3 pb-1">
        <span class="text-base font-semibold text-fg">{{ MEAL_LABELS[group.meal] }}</span>
        <span class="text-sm text-fg-muted">{{ formatKcal(group.kcal) }}</span>
      </h2>
      <ul class="divide-y divide-border">
        <li v-for="entry in group.entries" :key="entry.id">
          <button
            type="button"
            class="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-surface-2 active:bg-border/40"
            @click="emit('select', entry)"
          >
            <span
              class="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-muted"
              :title="SOURCE_LABEL[entry.source]"
              aria-hidden="true"
            >
              <Icon :name="SOURCE_ICON[entry.source]" :size="16" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-base text-fg">{{ entry.name }}</span>
              <span class="flex items-center gap-1.5 text-xs text-fg-muted">
                <span
                  v-if="entry.confidence"
                  class="inline-block size-1.5 rounded-full"
                  :class="CONFIDENCE_DOT[entry.confidence]"
                  :aria-label="`${entry.confidence} confidence`"
                />
                {{ formatQuantity(entry.quantity, entry.unit) }} · {{ formatGrams(entry.grams) }}
              </span>
            </span>
            <span class="shrink-0 text-base font-semibold text-fg">
              {{ formatKcal(entry.nutrients.energy_kcal) }}
            </span>
            <Icon name="chevron-right" :size="18" class="shrink-0 text-fg-muted" />
          </button>
        </li>
      </ul>
    </Card>
  </div>
</template>
