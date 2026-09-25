<script setup lang="ts">
import { useId } from 'vue'
import Icon from './Icon.vue'

export interface SelectOption {
  value: string
  label: string
}

const model = defineModel<string>({ default: '' })

withDefaults(
  defineProps<{
    label: string
    options: SelectOption[]
    helper?: string
    error?: string | null
    disabled?: boolean
    placeholder?: string
  }>(),
  { error: null, disabled: false },
)

const id = useId()
</script>

<template>
  <div class="space-y-1.5">
    <label :for="id" class="block text-sm font-medium text-fg-muted">{{ label }}</label>
    <div class="relative">
      <!-- Native select: it opens the OS picker people already know. -->
      <select
        :id="id"
        v-model="model"
        :disabled="disabled"
        :aria-invalid="error ? true : undefined"
        class="h-12 w-full appearance-none rounded-control border bg-surface-2 pr-11 pl-4 text-base text-fg transition outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
        :class="error ? 'border-over' : 'border-border'"
      >
        <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
        <option v-for="option in options" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
      <span class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-fg-muted">
        <Icon name="chevron-right" :size="18" class="rotate-90" />
      </span>
    </div>
    <p v-if="error" class="text-sm text-over" role="alert">{{ error }}</p>
    <p v-else-if="helper" class="text-sm text-fg-muted">{{ helper }}</p>
  </div>
</template>
