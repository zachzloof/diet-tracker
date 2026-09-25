<script setup lang="ts">
withDefaults(defineProps<{ padded?: boolean; as?: 'div' | 'section' | 'article' }>(), {
  padded: true,
  as: 'div',
})
</script>

<template>
  <component
    :is="as"
    class="rounded-card border border-border bg-surface shadow-card"
    :class="padded && 'p-4'"
  >
    <slot />
  </component>
</template>
