<script setup lang="ts">
import { useId } from 'vue'

const model = defineModel<string>({ default: '' })

withDefaults(
  defineProps<{
    label: string
    type?: 'text' | 'email' | 'password' | 'search' | 'tel' | 'url' | 'date'
    name?: string
    placeholder?: string
    helper?: string
    error?: string | null
    autocomplete?: string
    inputmode?: 'text' | 'email' | 'decimal' | 'numeric' | 'tel' | 'search' | 'url'
    required?: boolean
    disabled?: boolean
    autofocus?: boolean
  }>(),
  { type: 'text', error: null, required: false, disabled: false, autofocus: false },
)

const id = useId()
</script>

<template>
  <div class="space-y-1.5">
    <label :for="id" class="block text-sm font-medium text-fg-muted">{{ label }}</label>
    <div class="relative">
      <input
        :id="id"
        v-model="model"
        :type="type"
        :name="name"
        :placeholder="placeholder"
        :autocomplete="autocomplete"
        :inputmode="inputmode"
        :required="required"
        :disabled="disabled"
        :autofocus="autofocus"
        :aria-invalid="error ? true : undefined"
        :aria-describedby="error ? `${id}-error` : helper ? `${id}-helper` : undefined"
        class="h-12 w-full rounded-control border bg-surface-2 px-4 text-base text-fg placeholder:text-fg-muted/70 transition outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
        :class="[error ? 'border-over' : 'border-border', $slots.right && 'pr-12']"
      />
      <div v-if="$slots.right" class="absolute inset-y-0 right-1 flex items-center">
        <slot name="right" />
      </div>
    </div>
    <p v-if="error" :id="`${id}-error`" class="text-sm text-over" role="alert">{{ error }}</p>
    <p v-else-if="helper" :id="`${id}-helper`" class="text-sm text-fg-muted">{{ helper }}</p>
  </div>
</template>
