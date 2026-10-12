<script setup lang="ts">
import IconButton from './IconButton.vue'

/**
 * Step through days or weeks: arrows at the screen's edges where a thumb lands, the
 * label in the middle tapping back to the present. Sits at the top of the body so the
 * header keeps room for the Food / Gym switch.
 */
withDefaults(
  defineProps<{
    label: string
    /** On the present day or week: the forward arrow and the label are inert. */
    isCurrent: boolean
    unit?: 'day' | 'week'
  }>(),
  { unit: 'day' },
)

const emit = defineEmits<{ prev: []; next: []; reset: [] }>()
</script>

<template>
  <div class="-mx-2 flex items-center justify-between">
    <IconButton :label="`Previous ${unit}`" icon="chevron-left" @click="emit('prev')" />
    <button
      type="button"
      class="min-h-11 min-w-0 flex-1 truncate px-2 text-center text-sm font-semibold text-fg"
      :disabled="isCurrent"
      :aria-label="isCurrent ? undefined : `${label}. Back to this ${unit}`"
      @click="emit('reset')"
    >
      {{ label }}
    </button>
    <IconButton
      :label="`Next ${unit}`"
      icon="chevron-right"
      :disabled="isCurrent"
      @click="emit('next')"
    />
  </div>
</template>
