<script setup lang="ts">
import type { Food } from '@diet-tracker/shared'
import { ref } from 'vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Button from '@/components/ui/Button.vue'
import { formatKcal } from '@/lib/format'
import { useUiStore } from '@/stores/ui'
import { basisLabel } from './food-form'
import { useFoods } from './useLog'

/** Search My foods and pick one. Re-logging from here never makes an AI call (D5). */
const emit = defineEmits<{ pick: [food: Food]; manual: [] }>()

const ui = useUiStore()
const q = ref('')
const foods = useFoods(q)
</script>

<template>
  <div class="space-y-3">
    <div class="relative">
      <span class="pointer-events-none absolute inset-y-0 left-4 flex items-center text-fg-muted">
        <Icon name="search" :size="18" />
      </span>
      <input
        v-model="q"
        type="search"
        placeholder="Search my foods"
        aria-label="Search my foods"
        autocomplete="off"
        enterkeyhint="search"
        class="h-12 w-full rounded-control border border-border bg-surface-2 pr-4 pl-11 text-base text-fg placeholder:text-fg-muted/70 transition outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
      />
    </div>

    <p v-if="foods.isLoading.value && !ui.online" class="text-sm text-fg-muted">
      You're offline and your foods aren't saved on this phone yet. They will be after the next
      visit to My foods with a connection.
    </p>

    <div v-else-if="foods.isLoading.value" class="space-y-2" aria-busy="true">
      <Skeleton v-for="i in 4" :key="i" class="h-14 w-full" />
    </div>

    <p v-else-if="foods.isError.value" class="text-sm text-fg-muted">
      {{ foods.error.value?.message ?? 'Could not load your foods.' }}
      <button type="button" class="ml-1 font-semibold text-accent" @click="foods.refetch()">
        Try again
      </button>
    </p>

    <EmptyState
      v-else-if="foods.foods.value.length === 0"
      icon="book"
      :title="q ? 'No matches' : 'No saved foods yet'"
      :description="
        q
          ? 'Try another word, or describe it and let the estimator work it out.'
          : 'Foods you enter by hand, and AI estimates you save, appear here for one-tap logging.'
      "
    >
      <Button variant="secondary" @click="emit('manual')">Add a food manually</Button>
    </EmptyState>

    <ul
      v-else
      class="divide-y divide-border rounded-card border border-border"
      aria-label="My foods"
    >
      <li v-for="food in foods.foods.value" :key="food.id">
        <button
          type="button"
          class="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-surface-2 active:bg-border/40"
          @click="emit('pick', food)"
        >
          <span class="min-w-0 flex-1">
            <span class="block truncate text-base text-fg">
              {{ food.name
              }}<span v-if="food.brand" class="text-fg-muted"> · {{ food.brand }}</span>
            </span>
            <span class="block text-xs text-fg-muted">
              {{ formatKcal(food.nutrients.energy_kcal) }} {{ basisLabel(food) }}
            </span>
          </span>
          <Icon name="chevron-right" :size="18" class="shrink-0 text-fg-muted" />
        </button>
      </li>
    </ul>
  </div>
</template>
