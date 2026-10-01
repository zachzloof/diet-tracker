<script setup lang="ts">
import {
  MEAL_LABELS,
  savedMealTotals,
  type LogEntryInput,
  type Meal,
  type SavedMeal,
} from '@diet-tracker/shared'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '@/components/ui/AppShell.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Sheet from '@/components/ui/Sheet.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useCreateEntries } from '@/features/log/useLog'
import { useLocalDay } from '@/features/log/useLocalDay'
import { ApiError } from '@/lib/api'
import { formatInstant, formatKcal } from '@/lib/format'
import { useUiStore } from '@/stores/ui'
import MealLogReview from './MealLogReview.vue'
import { ingredientCount } from './meal-items'
import { useMeals } from './useMeals'

/**
 * Meals: the person's regular meals, each a set of ingredients that is logged in one go.
 * Tap one to log it (or to get to its editor); the plus makes a new one.
 */
const ui = useUiStore()
const router = useRouter()
const { today, suggestion } = useLocalDay()
const meals = useMeals()
const createEntries = useCreateEntries()

// The sheet keeps showing the meal while it slides away, so `selected` outlives `sheetOpen`.
const selected = ref<SavedMeal | null>(null)
const sheetOpen = ref(false)
const error = ref<string | null>(null)

function select(meal: SavedMeal): void {
  selected.value = meal
  error.value = null
  createEntries.reset()
  sheetOpen.value = true
}

function logMeal(payload: {
  day: string
  meal: Meal
  entries: LogEntryInput[]
  savedMealId: string
}): void {
  error.value = null
  createEntries.mutate(
    {
      day: payload.day,
      meal: payload.meal,
      loggedAt: new Date().toISOString(),
      entries: payload.entries,
      savedMealId: payload.savedMealId,
    },
    {
      onSuccess: (response) => {
        const kcal = payload.entries.reduce((sum, e) => sum + e.nutrients.energy_kcal, 0)
        ui.toast(
          response.queued
            ? `Saved offline · ${formatKcal(kcal)}. It will be sent when you're back online.`
            : `Added to ${MEAL_LABELS[payload.meal].toLowerCase()} · ${formatKcal(kcal)}`,
          'success',
        )
        sheetOpen.value = false
      },
      onError: (e: unknown) => {
        error.value = e instanceof ApiError ? e.message : 'Could not save. Please try again.'
      },
    },
  )
}

function edit(meal: SavedMeal): void {
  sheetOpen.value = false
  void router.push({ name: 'meal-edit', params: { id: meal.id } })
}
</script>

<template>
  <AppShell title="Meals" :back="{ name: 'you' }">
    <template #header-right>
      <IconButton label="New meal" icon="plus" @click="router.push({ name: 'meal-new' })" />
    </template>

    <div class="space-y-4">
      <Card v-if="meals.isLoading.value && !ui.online">
        <h2 class="flex items-center gap-2 text-base font-semibold">
          <Icon name="wifi-off" :size="20" class="text-fg-muted" /> You're offline
        </h2>
        <p class="mt-1 text-sm text-fg-muted">
          Your meals aren't saved on this phone yet. They will be after the next visit with a
          connection.
        </p>
        <Button class="mt-4" variant="secondary" @click="meals.refetch()">Try again</Button>
      </Card>

      <div v-else-if="meals.isLoading.value" class="space-y-2" aria-busy="true">
        <Skeleton v-for="i in 4" :key="i" class="h-16 w-full" rounded="card" />
      </div>

      <Card v-else-if="meals.isError.value && !meals.hasData.value">
        <h2 class="text-base font-semibold">Couldn't load your meals</h2>
        <p class="mt-1 text-sm text-fg-muted">
          {{ meals.error.value?.message ?? 'Something went wrong.' }}
        </p>
        <Button class="mt-4" variant="secondary" @click="meals.refetch()">Try again</Button>
      </Card>

      <Card v-else-if="meals.meals.value.length === 0" :padded="false">
        <EmptyState
          icon="utensils"
          title="No meals yet"
          description="Save a meal you eat often, ingredients and all, then log it in one go instead of entering each ingredient every time."
        >
          <Button :disabled="!ui.online" @click="router.push({ name: 'meal-new' })">
            <Icon name="plus" :size="20" /> {{ ui.online ? 'New meal' : 'Offline' }}
          </Button>
        </EmptyState>
      </Card>

      <template v-else>
        <Card :padded="false">
          <ul class="divide-y divide-border" aria-label="Meals">
            <li v-for="meal in meals.meals.value" :key="meal.id">
              <button
                type="button"
                class="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2 active:bg-border/40"
                @click="select(meal)"
              >
                <span
                  class="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-muted"
                  aria-hidden="true"
                >
                  <Icon name="utensils" :size="16" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-base text-fg">{{ meal.name }}</span>
                  <span class="block truncate text-xs text-fg-muted">
                    {{ formatKcal(savedMealTotals(meal.items).totals.energy_kcal) }} ·
                    {{ ingredientCount(meal.items.length) }}
                    <template v-if="meal.lastUsedAt">
                      · logged {{ formatInstant(meal.lastUsedAt) }}
                    </template>
                  </span>
                </span>
                <Icon name="chevron-right" :size="18" class="shrink-0 text-fg-muted" />
              </button>
            </li>
          </ul>
        </Card>
        <p class="px-2 text-center text-xs text-fg-muted">
          Tap a meal to log it or change it. They are also under Meals when you tap the + to log.
        </p>
      </template>
    </div>

    <Sheet v-model:open="sheetOpen" :title="selected?.name ?? ''" size="tall">
      <div v-if="selected" class="space-y-4">
        <MealLogReview
          :saved="selected"
          :today="today"
          :previous-day="suggestion.previousDay"
          :initial-day="suggestion.day"
          :initial-meal="suggestion.meal"
          :saving="createEntries.isPending.value"
          :error="error"
          @confirm="logMeal"
        />
        <Button block variant="secondary" @click="edit(selected)">
          <Icon name="pencil" :size="18" /> Edit meal
        </Button>
      </div>
    </Sheet>
  </AppShell>
</template>
