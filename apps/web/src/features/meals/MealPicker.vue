<script setup lang="ts">
import { savedMealTotals, type SavedMeal } from '@diet-tracker/shared'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { formatKcal } from '@/lib/format'
import { useUiStore } from '@/stores/ui'
import { ingredientCount } from './meal-items'
import { useMeals } from './useMeals'

/** Pick a saved meal to log. The list is the person's own, most recently logged first. */
const emit = defineEmits<{ pick: [meal: SavedMeal]; create: []; manage: [] }>()

const ui = useUiStore()
const meals = useMeals()
</script>

<template>
  <div class="space-y-3">
    <p v-if="meals.isLoading.value && !ui.online" class="text-sm text-fg-muted">
      You're offline and your meals aren't saved on this phone yet. They will be after the next
      visit with a connection.
    </p>

    <div v-else-if="meals.isLoading.value" class="space-y-2" aria-busy="true">
      <Skeleton v-for="i in 3" :key="i" class="h-14 w-full" />
    </div>

    <p v-else-if="meals.isError.value && !meals.hasData.value" class="text-sm text-fg-muted">
      {{ meals.error.value?.message ?? 'Could not load your meals.' }}
      <button type="button" class="ml-1 font-semibold text-accent" @click="meals.refetch()">
        Try again
      </button>
    </p>

    <EmptyState
      v-else-if="meals.meals.value.length === 0"
      icon="utensils"
      title="No meals yet"
      description="Save a meal you eat often, ingredients and all, then log it from here without typing a thing."
    >
      <Button variant="secondary" :disabled="!ui.online" @click="emit('create')">
        {{ ui.online ? 'Create a meal' : 'Offline' }}
      </Button>
    </EmptyState>

    <template v-else>
      <ul class="divide-y divide-border rounded-card border border-border" aria-label="Meals">
        <li v-for="meal in meals.meals.value" :key="meal.id">
          <button
            type="button"
            class="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-surface-2 active:bg-border/40"
            @click="emit('pick', meal)"
          >
            <span class="min-w-0 flex-1">
              <span class="block truncate text-base text-fg">{{ meal.name }}</span>
              <span class="block text-xs text-fg-muted">
                {{ formatKcal(savedMealTotals(meal.items).totals.energy_kcal) }} ·
                {{ ingredientCount(meal.items.length) }}
              </span>
            </span>
            <Icon name="chevron-right" :size="18" class="shrink-0 text-fg-muted" />
          </button>
        </li>
      </ul>
      <button
        type="button"
        class="flex min-h-11 w-full items-center justify-center gap-1.5 text-sm font-semibold text-accent"
        @click="emit('manage')"
      >
        <Icon name="pencil" :size="16" /> New meal or edit meals
      </button>
    </template>
  </div>
</template>
