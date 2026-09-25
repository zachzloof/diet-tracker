<script setup lang="ts">
import { ref, useId } from 'vue'
import Icon from './Icon.vue'

/** A list of short free-text items (allergies, dislikes) with add and remove. */
const model = defineModel<string[]>({ default: () => [] })

withDefaults(
  defineProps<{
    label: string
    placeholder?: string
    helper?: string
    max?: number
  }>(),
  { max: 30 },
)

const id = useId()
const text = ref('')

function add(): void {
  const value = text.value.trim().toLowerCase().slice(0, 40)
  if (!value) return
  if (!model.value.includes(value)) model.value = [...model.value, value]
  text.value = ''
}

function remove(item: string): void {
  model.value = model.value.filter((existing) => existing !== item)
}
</script>

<template>
  <div class="space-y-2">
    <label :for="id" class="block text-sm font-medium text-fg-muted">{{ label }}</label>
    <div class="flex gap-2">
      <input
        :id="id"
        v-model="text"
        type="text"
        :placeholder="placeholder"
        autocomplete="off"
        autocapitalize="none"
        enterkeyhint="done"
        :disabled="model.length >= max"
        class="h-12 min-w-0 flex-1 rounded-control border border-border bg-surface-2 px-4 text-base text-fg placeholder:text-fg-muted/70 transition outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
        @keydown.enter.prevent="add"
      />
      <button
        type="button"
        class="h-12 shrink-0 rounded-control border border-border bg-surface-2 px-4 text-base font-semibold text-fg transition hover:bg-border/60 disabled:opacity-50"
        :disabled="!text.trim()"
        @click="add"
      >
        Add
      </button>
    </div>
    <p v-if="helper" class="text-sm text-fg-muted">{{ helper }}</p>
    <ul v-if="model.length" class="flex flex-wrap gap-2" aria-label="Added items">
      <li v-for="item in model" :key="item">
        <button
          type="button"
          class="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-surface-2 pr-2 pl-3 text-sm font-medium text-fg transition hover:bg-border/60"
          :aria-label="`Remove ${item}`"
          @click="remove(item)"
        >
          {{ item }}
          <Icon name="x" :size="14" class="text-fg-muted" />
        </button>
      </li>
    </ul>
  </div>
</template>
