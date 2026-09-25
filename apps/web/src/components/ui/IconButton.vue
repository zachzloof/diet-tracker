<script setup lang="ts">
import Icon, { type IconName } from './Icon.vue'

withDefaults(
  defineProps<{
    label: string
    icon: IconName
    type?: 'button' | 'submit'
    disabled?: boolean
  }>(),
  { type: 'button', disabled: false },
)
</script>

<template>
  <button
    :type="type"
    :aria-label="label"
    :title="label"
    :disabled="disabled"
    class="inline-flex size-11 items-center justify-center rounded-full text-fg-muted transition hover:bg-surface-2 hover:text-fg active:bg-border/60 disabled:opacity-50"
  >
    <Icon :name="icon" :size="22" />
  </button>
</template>
