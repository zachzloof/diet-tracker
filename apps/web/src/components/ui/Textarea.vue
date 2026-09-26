<script setup lang="ts">
import { useId } from 'vue'

const model = defineModel<string>({ default: '' })

withDefaults(
  defineProps<{
    label: string
    placeholder?: string
    helper?: string
    error?: string | null
    rows?: number
    maxlength?: number
    disabled?: boolean
    autofocus?: boolean
    enterkeyhint?: 'done' | 'send' | 'go' | 'enter'
  }>(),
  { error: null, rows: 3, disabled: false, autofocus: false, enterkeyhint: 'done' },
)

const emit = defineEmits<{ submit: [] }>()
const id = useId()
</script>

<template>
  <div class="space-y-1.5">
    <label :for="id" class="block text-sm font-medium text-fg-muted">{{ label }}</label>
    <textarea
      :id="id"
      v-model="model"
      :rows="rows"
      :placeholder="placeholder"
      :maxlength="maxlength"
      :disabled="disabled"
      :autofocus="autofocus"
      :enterkeyhint="enterkeyhint"
      autocapitalize="sentences"
      :aria-invalid="error ? true : undefined"
      :aria-describedby="error ? `${id}-error` : helper ? `${id}-helper` : undefined"
      class="w-full resize-none rounded-control border bg-surface-2 px-4 py-3 text-base leading-snug text-fg placeholder:text-fg-muted/70 transition outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
      :class="error ? 'border-over' : 'border-border'"
      @keydown.enter.exact.prevent="emit('submit')"
    />
    <p v-if="error" :id="`${id}-error`" class="text-sm text-over" role="alert">{{ error }}</p>
    <p v-else-if="helper" :id="`${id}-helper`" class="text-sm text-fg-muted">{{ helper }}</p>
  </div>
</template>
