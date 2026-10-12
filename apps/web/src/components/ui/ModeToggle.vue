<script setup lang="ts">
import { useAppMode } from '@/features/mode/useAppMode'
import type { AppMode } from '@/stores/ui'
import Icon, { type IconName } from './Icon.vue'

/**
 * The switch between the two halves of the app (D38), centred in the header of every
 * root screen. Food and Gym each have their own Today, list and Week; You is shared.
 */
const { mode, switchTo } = useAppMode()

const OPTIONS: { value: AppMode; label: string; icon: IconName }[] = [
  { value: 'diet', label: 'Food', icon: 'utensils' },
  { value: 'training', label: 'Gym', icon: 'dumbbell' },
]
</script>

<template>
  <div
    role="radiogroup"
    aria-label="Food or gym"
    class="flex h-9 shrink-0 rounded-full border border-border bg-surface-2 p-0.5"
  >
    <button
      v-for="option in OPTIONS"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="mode === option.value"
      class="flex items-center gap-1 rounded-full px-2.5 text-sm font-semibold transition duration-150 ease-out"
      :class="
        mode === option.value
          ? 'bg-surface text-fg shadow-card'
          : 'text-fg-muted hover:text-fg active:bg-border/40'
      "
      @click="switchTo(option.value)"
    >
      <Icon :name="option.icon" :size="16" />
      {{ option.label }}
    </button>
  </div>
</template>
