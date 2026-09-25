<script setup lang="ts">
import Icon, { type IconName } from './Icon.vue'

defineProps<{
  icon: IconName
  title: string
  description?: string
}>()
</script>

<template>
  <div class="flex flex-col items-center px-4 py-10 text-center">
    <div
      class="flex size-14 items-center justify-center rounded-full bg-surface-2 text-fg-muted"
      aria-hidden="true"
    >
      <Icon :name="icon" :size="26" />
    </div>
    <h2 class="mt-4 text-xl font-semibold text-fg">{{ title }}</h2>
    <p v-if="description" class="mt-1 max-w-xs text-base text-fg-muted">{{ description }}</p>
    <div v-if="$slots.default" class="mt-5">
      <slot />
    </div>
  </div>
</template>
