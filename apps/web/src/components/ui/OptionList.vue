<script setup lang="ts">
import Icon from './Icon.vue'

export interface ListOption {
  value: string
  label: string
  help?: string
}

/** Big tappable radio cards: one question, a few answers, thumb-sized. */
const model = defineModel<string | null>({ default: null })

defineProps<{
  label: string
  options: ListOption[]
}>()
</script>

<template>
  <div role="radiogroup" :aria-label="label" class="space-y-2">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="model === option.value"
      class="flex min-h-14 w-full items-center gap-3 rounded-card border px-4 py-3 text-left transition duration-150 ease-out active:scale-[0.99]"
      :class="
        model === option.value
          ? 'border-accent bg-accent/10'
          : 'border-border bg-surface hover:bg-surface-2'
      "
      @click="model = option.value"
    >
      <span class="min-w-0 flex-1">
        <span class="block text-base font-semibold text-fg">{{ option.label }}</span>
        <span v-if="option.help" class="block text-sm text-fg-muted">{{ option.help }}</span>
      </span>
      <span
        class="flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition"
        :class="model === option.value ? 'border-accent bg-accent text-accent-fg' : 'border-border'"
        aria-hidden="true"
      >
        <Icon v-if="model === option.value" name="check" :size="14" />
      </span>
    </button>
  </div>
</template>
