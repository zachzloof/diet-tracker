<script setup lang="ts">
import type { TargetStatus } from '@diet-tracker/shared'
import { STATUS_LABELS } from '@/lib/format'

/**
 * A target's status as a dot, never colour alone: the label is rendered (or read by a
 * screen reader) and `short` is an outline rather than a fill.
 */
withDefaults(
  defineProps<{
    status: TargetStatus | null
    /** Show the status word next to the dot. */
    label?: boolean
    size?: 'sm' | 'md' | 'lg'
  }>(),
  { label: false, size: 'sm' },
)

const DOT: Record<string, string> = {
  met: 'bg-met',
  close: 'bg-close',
  over: 'bg-over',
  short: 'border-2 border-short bg-transparent',
  unscored: 'bg-border',
  none: 'border border-dashed border-border bg-transparent',
}
const SIZE = { sm: 'size-2.5', md: 'size-3', lg: 'size-4' } as const
</script>

<template>
  <span class="inline-flex items-center gap-1.5">
    <span
      class="inline-block shrink-0 rounded-full"
      :class="[DOT[status ?? 'none'], SIZE[size]]"
      aria-hidden="true"
    />
    <span :class="label ? 'text-xs text-fg-muted' : 'sr-only'">
      {{ status ? STATUS_LABELS[status] : 'Not logged' }}
    </span>
  </span>
</template>
