<script setup lang="ts">
import Icon, { type IconName } from './Icon.vue'

export interface PillOption {
  value: string
  label: string
  icon?: IconName
}

/**
 * A compact segmented pill for switching a view: Food / Gym in the header of every root
 * screen (`ModeToggle`) and Last / Best on a session. 36 px tall so it fits a header row;
 * `SegmentedControl` is the taller control for forms.
 */
const model = defineModel<string>({ required: true })

defineProps<{
  label: string
  options: readonly PillOption[]
}>()
</script>

<template>
  <div
    role="radiogroup"
    :aria-label="label"
    class="flex h-9 shrink-0 rounded-full border border-border bg-surface-2 p-0.5"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="model === option.value"
      class="flex items-center gap-1 rounded-full px-2.5 text-sm font-semibold transition duration-150 ease-out"
      :class="
        model === option.value
          ? 'bg-surface text-fg shadow-card'
          : 'text-fg-muted hover:text-fg active:bg-border/40'
      "
      @click="model = option.value"
    >
      <Icon v-if="option.icon" :name="option.icon" :size="16" />
      {{ option.label }}
    </button>
  </div>
</template>
