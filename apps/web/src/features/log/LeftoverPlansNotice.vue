<script setup lang="ts">
import { leftoverPlanDays } from '@diet-tracker/shared'
import { useQueries } from '@tanstack/vue-query'
import { computed } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import { useQueueStore } from '@/stores/queue'
import { leftoverNotice } from './leftover-plans'
import { dayQueryOptions } from './useLog'

/**
 * One line on Today when a plan from the last two days has not been ticked (D43). It reads the
 * same cached day logs those days open with, so the tap lands at once and a tick on that day
 * clears the line. It has no dismiss: it goes when the plan is ticked, removed or expires.
 */
const props = defineProps<{ today: string }>()
const emit = defineEmits<{ open: [day: string] }>()

const queue = useQueueStore()
const days = computed(() => leftoverPlanDays(props.today))
const logs = useQueries({ queries: computed(() => days.value.map(dayQueryOptions)) })

const notice = computed(() =>
  leftoverNotice(
    days.value.map((day, index) => ({
      day,
      entries: [...(logs.value[index]?.data?.entries ?? []), ...queue.pendingFor(day)],
    })),
    props.today,
  ),
)
</script>

<template>
  <button
    v-if="notice"
    type="button"
    class="flex min-h-11 w-full items-center gap-2 rounded-card border border-border bg-surface-2 px-3 py-2 text-left text-sm text-fg-muted transition hover:bg-border/40 active:bg-border/40"
    @click="emit('open', notice.day)"
  >
    <Icon name="calendar" :size="18" class="shrink-0" />
    <span class="min-w-0 flex-1">{{ notice.text }}</span>
    <Icon name="chevron-right" :size="18" class="shrink-0" />
  </button>
</template>
