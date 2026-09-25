<script setup lang="ts">
import { useId } from 'vue'

const model = defineModel<boolean>({ default: false })

withDefaults(defineProps<{ label: string; description?: string; disabled?: boolean }>(), {
  disabled: false,
})

const id = useId()
</script>

<template>
  <div class="flex min-h-12 items-center justify-between gap-4">
    <div class="min-w-0">
      <span :id="id" class="block text-base text-fg">{{ label }}</span>
      <span v-if="description" class="block text-sm text-fg-muted">{{ description }}</span>
    </div>
    <button
      type="button"
      role="switch"
      :aria-checked="model"
      :aria-labelledby="id"
      :disabled="disabled"
      class="relative h-8 w-14 shrink-0 rounded-full transition duration-200 ease-out disabled:opacity-50"
      :class="model ? 'bg-accent' : 'bg-border'"
      @click="model = !model"
    >
      <span
        class="absolute top-1 left-1 size-6 rounded-full bg-white shadow transition duration-200 ease-out"
        :class="model && 'translate-x-6'"
        aria-hidden="true"
      />
    </button>
  </div>
</template>
