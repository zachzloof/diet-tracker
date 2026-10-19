<script setup lang="ts">
import { computed } from 'vue'
import { useAppMode } from '@/features/mode/useAppMode'
import PillToggle, { type PillOption } from './PillToggle.vue'

/**
 * The switch between the two halves of the app (D38), centred in the header of every
 * root screen. Food and Gym each have their own Today, list and Week; You is shared.
 */
const { mode, switchTo } = useAppMode()

const OPTIONS: readonly PillOption[] = [
  { value: 'diet', label: 'Food', icon: 'utensils' },
  { value: 'training', label: 'Gym', icon: 'dumbbell' },
]

const model = computed({
  get: (): string => mode.value,
  set: (value: string) => {
    if (value === 'diet' || value === 'training') switchTo(value)
  },
})
</script>

<template>
  <PillToggle v-model="model" label="Food or gym" :options="OPTIONS" />
</template>
