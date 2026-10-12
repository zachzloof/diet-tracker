<script setup lang="ts">
import { RouterLink } from 'vue-router'
import Icon from '@/components/ui/Icon.vue'
import { sessionLine, workoutTitle, type SessionSummary } from './draft'

/** Sessions as tappable rows: name, then time, sets and weight lifted, or "In progress". */
defineProps<{ sessions: SessionSummary[] }>()
</script>

<template>
  <ul class="divide-y divide-border rounded-card border border-border bg-surface">
    <li v-for="session in sessions" :key="session.id">
      <RouterLink
        :to="{ name: 'workout', params: { id: session.id } }"
        class="flex min-h-14 items-center justify-between gap-3 px-3 py-2 transition hover:bg-surface-2"
      >
        <span class="min-w-0">
          <span class="block truncate text-base font-medium text-fg">
            {{ workoutTitle(session.title) }}
          </span>
          <span class="block truncate text-sm text-fg-muted">
            <span v-if="!session.endedAt" class="font-semibold text-accent">In progress</span>
            <template v-else>{{ sessionLine(session) }}</template>
            <template v-if="session.local"> · on this phone</template>
          </span>
        </span>
        <Icon name="chevron-right" :size="20" class="shrink-0 text-fg-muted" />
      </RouterLink>
    </li>
  </ul>
</template>
