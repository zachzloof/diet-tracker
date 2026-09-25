<script setup lang="ts">
import type { TargetEntry } from '@diet-tracker/shared'
import Icon from '@/components/ui/Icon.vue'
import { KIND_LABELS, formatNumber, targetLabel, unitLabel } from '@/lib/format'

defineProps<{ entry: TargetEntry }>()
const emit = defineEmits<{ select: [] }>()
</script>

<template>
  <button
    type="button"
    class="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-surface-2 active:bg-border/40"
    @click="emit('select')"
  >
    <span class="min-w-0 flex-1">
      <span class="block truncate text-base text-fg">{{ targetLabel(entry.key) }}</span>
      <span class="block text-xs text-fg-muted">
        {{ KIND_LABELS[entry.kind] }}<template v-if="entry.overridden"> · set by you</template>
      </span>
    </span>
    <span class="shrink-0 text-right">
      <span class="text-base font-semibold text-fg">{{ formatNumber(entry.value) }}</span>
      <span class="ml-1 text-sm text-fg-muted">{{ unitLabel(entry.unit, entry.key) }}</span>
    </span>
    <Icon name="chevron-right" :size="18" class="shrink-0 text-fg-muted" />
  </button>
</template>
