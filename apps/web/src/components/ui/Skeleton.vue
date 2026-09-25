<script setup lang="ts">
/** A pulsing placeholder in the shape of the content that will replace it. Size it with classes. */
withDefaults(defineProps<{ rounded?: 'control' | 'card' | 'full' }>(), { rounded: 'control' })

const RADIUS = { control: 'rounded-control', card: 'rounded-card', full: 'rounded-full' } as const
</script>

<template>
  <div class="animate-pulse bg-surface-2" :class="RADIUS[rounded]" aria-hidden="true" />
</template>
