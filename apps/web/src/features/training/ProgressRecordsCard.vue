<script setup lang="ts">
import type { PersonalRecord } from '@diet-tracker/shared'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Card from '@/components/ui/Card.vue'
import Icon from '@/components/ui/Icon.vue'
import { formatDay, formatDayShort } from '@/lib/format'
import { metricDeltaLabel, metricSetLabel } from './draft'

/**
 * Records set in the range (`personalRecords`): each session where an exercise's best set
 * beat every earlier session read, newest first, ranked as the lift page ranks it (D39).
 * Each row opens the session.
 */
const props = defineProps<{ records: PersonalRecord[]; since: string; windowLabel: string }>()

const FIRST = 5
const expanded = ref(false)
const shown = computed(() => (expanded.value ? props.records : props.records.slice(0, FIRST)))
const exercises = computed(() => new Set(props.records.map((record) => record.exerciseName)).size)
</script>

<template>
  <Card :padded="false">
    <div class="px-4 pt-4">
      <h2 class="flex items-center gap-2 text-base font-semibold">
        <Icon name="award" :size="20" class="text-accent" />
        Records
        <span v-if="records.length" class="text-sm font-normal text-fg-muted">
          {{ records.length }} across {{ exercises }}
          {{ exercises === 1 ? 'exercise' : 'exercises' }}
        </span>
      </h2>
      <p class="mt-0.5 text-xs text-fg-muted">
        A best set that beat every earlier session since {{ formatDay(since) }}. The first time you
        do an exercise sets the mark; it isn't a record.
      </p>
    </div>
    <p v-if="records.length === 0" class="px-4 pt-3 pb-4 text-sm text-fg-muted">
      No new records in the last {{ windowLabel }}.
    </p>
    <ul v-else class="mt-2 divide-y divide-border">
      <li v-for="record in shown" :key="`${record.workoutId}-${record.exerciseName}`">
        <RouterLink
          :to="{ name: 'workout', params: { id: record.workoutId } }"
          class="flex min-h-14 items-center justify-between gap-3 px-4 py-2 transition hover:bg-surface-2"
        >
          <span class="min-w-0">
            <span class="block truncate text-base font-medium text-fg">{{
              record.exerciseName
            }}</span>
            <span class="block truncate text-sm text-fg-muted">
              {{ metricSetLabel(record.set, record.metric, record.bodyweightKg) }}
            </span>
          </span>
          <span class="shrink-0 text-right">
            <span class="block text-sm font-semibold text-fg tabular-nums">{{
              metricDeltaLabel(record.value - record.previous, record.metric)
            }}</span>
            <span class="block text-xs text-fg-muted">{{ formatDayShort(record.day) }}</span>
          </span>
        </RouterLink>
      </li>
    </ul>
    <button
      v-if="records.length > FIRST"
      type="button"
      class="flex min-h-11 w-full items-center justify-center gap-1 border-t border-border text-sm font-medium text-accent"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      {{ expanded ? 'Show fewer' : `Show all ${records.length}` }}
      <Icon name="chevron-down" :size="16" :class="expanded && 'rotate-180'" />
    </button>
    <div v-else class="h-2" />
  </Card>
</template>
