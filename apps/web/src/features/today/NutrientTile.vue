<script setup lang="ts">
import type { TargetStatus } from '@diet-tracker/shared'
import Icon from '@/components/ui/Icon.vue'
import StatusDot from '@/components/ui/StatusDot.vue'

/**
 * One vitamin, mineral or limit tile on Today: name, amount (the default slot) and status,
 * as the disclosure button for the panel of foods behind it. The chevron shares the status
 * line so the name keeps the full width at 360 px.
 */
defineProps<{ label: string; status: TargetStatus; open: boolean; controls: string }>()
defineEmits<{ toggle: [] }>()

const TILE: Record<TargetStatus, string> = {
  met: 'border-met/40 bg-met/10',
  close: 'border-close/40 bg-close/10',
  short: 'border-border bg-transparent',
  over: 'border-over/40 bg-over/10',
  unscored: 'border-border bg-transparent',
}
</script>

<template>
  <button
    type="button"
    class="flex h-full w-full min-w-0 flex-col items-start rounded-control border px-2 py-2 text-left transition active:brightness-95"
    :class="[TILE[status], open && 'ring-2 ring-fg-muted/60']"
    :aria-expanded="open"
    :aria-controls="open ? controls : undefined"
    @click="$emit('toggle')"
  >
    <span class="block w-full truncate text-xs font-medium text-fg">{{ label }}</span>
    <span class="mt-0.5 block w-full truncate text-xs text-fg-muted"><slot /></span>
    <span class="mt-1 flex w-full items-center justify-between gap-1">
      <StatusDot :status="status" label />
      <Icon
        name="chevron-down"
        :size="14"
        class="shrink-0 text-fg-muted transition"
        :class="open && 'rotate-180'"
      />
    </span>
  </button>
</template>
