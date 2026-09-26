<script setup lang="ts">
import { computed, useId } from 'vue'
import Icon from './Icon.vue'

const model = defineModel<number | null>({ default: null })

const props = withDefaults(
  defineProps<{
    label: string
    unit?: string
    helper?: string
    error?: string | null
    min?: number
    max?: number
    step?: number
    placeholder?: string
    disabled?: boolean
  }>(),
  { step: 1, error: null, disabled: false },
)

const id = useId()

const text = computed({
  get: () => (model.value === null ? '' : String(model.value)),
  set: (raw: string) => {
    const trimmed = raw.trim().replace(',', '.')
    if (trimmed === '') {
      model.value = null
      return
    }
    const parsed = Number(trimmed)
    if (Number.isFinite(parsed)) model.value = parsed
  },
})

function clamp(value: number): number {
  const lo = props.min ?? Number.NEGATIVE_INFINITY
  const hi = props.max ?? Number.POSITIVE_INFINITY
  return Math.min(hi, Math.max(lo, value))
}

function nudge(direction: 1 | -1): void {
  const base = model.value ?? props.min ?? 0
  const decimals = (String(props.step).split('.')[1] ?? '').length
  model.value = Number(clamp(base + direction * props.step).toFixed(decimals))
}
</script>

<template>
  <div class="space-y-1.5">
    <label :for="id" class="block text-sm font-medium text-fg-muted">{{ label }}</label>
    <div
      class="flex h-12 items-stretch overflow-hidden rounded-control border bg-surface-2 transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30"
      :class="error ? 'border-over' : 'border-border'"
    >
      <button
        type="button"
        class="w-12 shrink-0 text-fg-muted hover:bg-border/60 disabled:opacity-40"
        :disabled="disabled"
        :aria-label="`Decrease ${label}`"
        @click="nudge(-1)"
      >
        <span class="mx-auto block h-0.5 w-3.5 rounded bg-current" aria-hidden="true" />
      </button>
      <input
        :id="id"
        v-model="text"
        type="text"
        inputmode="decimal"
        :placeholder="placeholder"
        :disabled="disabled"
        :aria-invalid="error ? true : undefined"
        :aria-describedby="error ? `${id}-error` : helper ? `${id}-helper` : undefined"
        class="min-w-0 flex-1 bg-transparent text-center text-base font-semibold text-fg outline-none"
      />
      <span
        v-if="unit"
        class="flex items-center pl-1.5 pr-2 text-sm text-fg-muted"
        aria-hidden="true"
      >
        {{ unit }}
      </span>
      <button
        type="button"
        class="flex w-12 shrink-0 items-center justify-center text-fg-muted hover:bg-border/60 disabled:opacity-40"
        :disabled="disabled"
        :aria-label="`Increase ${label}`"
        @click="nudge(1)"
      >
        <Icon name="plus" :size="18" />
      </button>
    </div>
    <p v-if="error" :id="`${id}-error`" class="text-sm text-over" role="alert">{{ error }}</p>
    <p v-else-if="helper" :id="`${id}-helper`" class="text-sm text-fg-muted">{{ helper }}</p>
  </div>
</template>
