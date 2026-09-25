<script setup lang="ts">
export interface SegmentOption<T extends string = string> {
  value: T
  label: string
}

const model = defineModel<string>({ required: true })

defineProps<{
  label: string
  options: SegmentOption[]
}>()
</script>

<template>
  <div
    role="radiogroup"
    :aria-label="label"
    class="flex h-12 rounded-control border border-border bg-surface-2 p-1"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="model === option.value"
      class="flex-1 rounded-[9px] text-sm font-semibold transition duration-150 ease-out"
      :class="
        model === option.value ? 'bg-surface text-fg shadow-card' : 'text-fg-muted hover:text-fg'
      "
      @click="model = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>
