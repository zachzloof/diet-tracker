<script setup lang="ts">
export type ChipTone = 'neutral' | 'accent' | 'met' | 'close' | 'short' | 'over'

withDefaults(defineProps<{ tone?: ChipTone; selected?: boolean }>(), {
  tone: 'neutral',
  selected: false,
})

const TONES: Record<ChipTone, string> = {
  neutral: 'bg-surface-2 text-fg border-border',
  accent: 'bg-accent/15 text-fg border-accent/40',
  met: 'bg-met/15 text-fg border-met/40',
  close: 'bg-close/15 text-fg border-close/40',
  short: 'bg-transparent text-fg-muted border-short/60',
  over: 'bg-over/15 text-fg border-over/40',
}
</script>

<template>
  <span
    class="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium whitespace-nowrap"
    :class="[TONES[tone], selected && 'ring-2 ring-accent/40']"
  >
    <slot />
  </span>
</template>
