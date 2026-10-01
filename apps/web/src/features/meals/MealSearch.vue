<script setup lang="ts">
import Icon from '@/components/ui/Icon.vue'

/** The search box above a list of meals. Matching is done by `filterMeals`, on the phone. */
const q = defineModel<string>({ required: true })
</script>

<template>
  <div class="relative">
    <span class="pointer-events-none absolute inset-y-0 left-4 flex items-center text-fg-muted">
      <Icon name="search" :size="18" />
    </span>
    <input
      v-model="q"
      type="search"
      placeholder="Search meals or ingredients"
      aria-label="Search meals"
      autocomplete="off"
      enterkeyhint="search"
      class="h-12 w-full rounded-control border border-border bg-surface-2 pr-4 pl-11 text-base text-fg placeholder:text-fg-muted/70 transition outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
    />
  </div>
</template>
