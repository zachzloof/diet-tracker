<script setup lang="ts">
defineProps<{
  label: string
  value: string | number
  unit?: string
  sub?: string
}>()
</script>

<template>
  <div class="rounded-card border border-border bg-surface p-3 shadow-card">
    <div class="text-xs font-medium tracking-wide text-fg-muted uppercase">{{ label }}</div>
    <div class="mt-1 flex items-baseline gap-1">
      <span class="text-[28px] leading-none font-bold text-fg">{{ value }}</span>
      <span v-if="unit" class="text-sm text-fg-muted">{{ unit }}</span>
    </div>
    <div v-if="sub" class="mt-1 text-xs text-fg-muted">{{ sub }}</div>
  </div>
</template>
