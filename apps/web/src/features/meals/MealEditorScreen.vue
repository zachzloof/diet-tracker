<script setup lang="ts">
import {
  MAX_SAVED_MEAL_ITEMS,
  savedMealInputSchema,
  sumPortions,
  toValidationDetails,
  type SavedMealItem,
} from '@diet-tracker/shared'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/ui/AppShell.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Icon from '@/components/ui/Icon.vue'
import Input from '@/components/ui/Input.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { ApiError } from '@/lib/api'
import { formatGrams, formatKcal, formatNumber } from '@/lib/format'
import { useUiStore } from '@/stores/ui'
import IngredientSheet from './IngredientSheet.vue'
import MealItemList from './MealItemList.vue'
import { fromDraftItem, ingredientCount, toDraftItem, type MealDraftItem } from './meal-items'
import { useCreateMeal, useDeleteMeal, useMeals, useUpdateMeal } from './useMeals'

/**
 * Build or change a saved meal: a name and its ingredients for one portion, each picked
 * from My foods or typed in by hand. Saving needs a connection; nothing here touches
 * what has already been logged.
 */
const route = useRoute()
const router = useRouter()
const ui = useUiStore()
const meals = useMeals()
const createMeal = useCreateMeal()
const updateMeal = useUpdateMeal()
const deleteMeal = useDeleteMeal()

const isNew = computed(() => route.name === 'meal-new')
const existing = computed(() => {
  const id = route.params.id
  return typeof id === 'string' ? (meals.meals.value.find((meal) => meal.id === id) ?? null) : null
})

const name = ref('')
const items = ref<MealDraftItem[]>([])
// An existing meal fills the form once; a background refetch must not undo what was typed.
const filled = ref(false)
watch(
  existing,
  (meal) => {
    if (!meal || filled.value) return
    name.value = meal.name
    items.value = meal.items.map(toDraftItem)
    filled.value = true
  },
  { immediate: true },
)

const adding = ref(false)
const fieldErrors = ref<Record<string, string[]>>({})
const error = ref<string | null>(null)
const confirmingDelete = ref(false)

const totals = computed(() => sumPortions(items.value))
const grams = computed(() => items.value.reduce((sum, item) => sum + item.grams, 0))
const full = computed(() => items.value.length >= MAX_SAVED_MEAL_ITEMS)

/** The first problem with the ingredients, named after the ingredient when it is about one. */
const itemsError = computed(() => {
  const general = fieldErrors.value.items?.[0]
  if (general) return general
  for (const [path, messages] of Object.entries(fieldErrors.value)) {
    const index = /^items\.(\d+)\./.exec(path)?.[1]
    const item = index === undefined ? undefined : items.value[Number(index)]
    if (item && messages[0]) return `${item.name}: ${messages[0]}`
  }
  return null
})

function addItem(item: SavedMealItem): void {
  items.value = [...items.value, toDraftItem(item)]
  fieldErrors.value = {}
  if (full.value) adding.value = false
}

function leave(): void {
  void router.replace({ name: 'meals' })
}

function save(): void {
  error.value = null
  const parsed = savedMealInputSchema.safeParse({
    name: name.value,
    items: items.value.map(fromDraftItem),
  })
  if (!parsed.success) {
    fieldErrors.value = toValidationDetails(parsed.error).fieldErrors
    return
  }
  fieldErrors.value = {}
  const onError = (e: unknown) => {
    error.value = e instanceof ApiError ? e.message : 'Could not save. Please try again.'
  }
  if (isNew.value) {
    createMeal.mutate(parsed.data, {
      onSuccess: () => {
        ui.toast('Meal saved. Find it under Meals when you log.', 'success')
        leave()
      },
      onError,
    })
  } else if (existing.value) {
    updateMeal.mutate(
      { id: existing.value.id, input: parsed.data },
      {
        onSuccess: () => {
          ui.toast('Meal updated', 'success')
          leave()
        },
        onError,
      },
    )
  }
}

function remove(): void {
  if (!existing.value) return
  if (!confirmingDelete.value) {
    confirmingDelete.value = true
    return
  }
  error.value = null
  deleteMeal.mutate(existing.value.id, {
    onSuccess: () => {
      ui.toast('Meal deleted. Logged entries keep their numbers.', 'success')
      leave()
    },
    onError: (e: unknown) => {
      error.value = e instanceof ApiError ? e.message : 'Could not delete. Please try again.'
    },
  })
}
</script>

<template>
  <AppShell :title="isNew ? 'New meal' : 'Edit meal'" :back="{ name: 'meals' }">
    <Card v-if="!isNew && !filled && meals.isLoading.value && !ui.online">
      <h2 class="flex items-center gap-2 text-base font-semibold">
        <Icon name="wifi-off" :size="20" class="text-fg-muted" /> You're offline
      </h2>
      <p class="mt-1 text-sm text-fg-muted">
        This meal isn't saved on this phone yet, and changing a meal needs a connection.
      </p>
      <Button class="mt-4" variant="secondary" @click="meals.refetch()">Try again</Button>
    </Card>

    <div v-else-if="!isNew && !filled && meals.isLoading.value" class="space-y-4" aria-busy="true">
      <Skeleton class="h-12 w-full" />
      <Skeleton class="h-40 w-full" rounded="card" />
      <Skeleton class="h-12 w-full" />
    </div>

    <Card v-else-if="!isNew && !filled && meals.isError.value">
      <h2 class="text-base font-semibold">Couldn't load this meal</h2>
      <p class="mt-1 text-sm text-fg-muted">
        {{ meals.error.value?.message ?? 'Something went wrong.' }}
      </p>
      <Button class="mt-4" variant="secondary" @click="meals.refetch()">Try again</Button>
    </Card>

    <Card v-else-if="!isNew && !filled">
      <h2 class="text-base font-semibold">This meal isn't here any more</h2>
      <p class="mt-1 text-sm text-fg-muted">It may have been deleted on another device.</p>
      <Button class="mt-4" variant="secondary" @click="leave">Back to Meals</Button>
    </Card>

    <div v-else class="space-y-4">
      <Input
        v-model="name"
        label="Name"
        placeholder="Overnight oats"
        autocomplete="off"
        :error="fieldErrors.name?.[0] ?? null"
      />

      <section class="space-y-3" aria-labelledby="ingredients-heading">
        <div class="flex items-baseline justify-between">
          <h2 id="ingredients-heading" class="text-base font-semibold text-fg">Ingredients</h2>
          <span v-if="items.length" class="text-sm text-fg-muted">for one portion</span>
        </div>

        <MealItemList v-if="items.length" v-model="items" />
        <p v-else class="rounded-card border border-dashed border-border p-4 text-sm text-fg-muted">
          Add what goes into one portion of this meal: foods from My foods with an amount, or
          anything typed in by hand.
        </p>
        <p v-if="itemsError" class="text-sm text-over" role="alert">{{ itemsError }}</p>

        <Button block variant="secondary" :disabled="full" @click="adding = true">
          <Icon name="plus" :size="20" /> Add ingredient
        </Button>
        <p v-if="full" class="text-sm text-fg-muted">
          A meal can have up to {{ MAX_SAVED_MEAL_ITEMS }} ingredients.
        </p>
      </section>

      <div
        v-if="items.length"
        class="flex items-baseline justify-between rounded-card bg-surface-2 p-3"
      >
        <span class="text-sm text-fg-muted">
          {{ ingredientCount(items.length) }} · {{ formatGrams(grams) }} ·
          <span class="text-protein">P {{ formatNumber(totals.totals.protein_g, 0) }}</span>
          <span class="text-carbs"> C {{ formatNumber(totals.totals.carbs_g, 0) }}</span>
          <span class="text-fat"> F {{ formatNumber(totals.totals.fat_g, 0) }}</span>
        </span>
        <span class="text-xl font-bold text-fg">{{ formatKcal(totals.totals.energy_kcal) }}</span>
      </div>

      <p v-if="error" class="text-sm text-over" role="alert">{{ error }}</p>

      <div class="space-y-2">
        <Button
          block
          :loading="createMeal.isPending.value || updateMeal.isPending.value"
          :disabled="!ui.online"
          @click="save"
        >
          {{ ui.online ? (isNew ? 'Save meal' : 'Save changes') : 'Offline' }}
        </Button>
        <Button
          v-if="!isNew"
          block
          variant="destructive"
          :loading="deleteMeal.isPending.value"
          :disabled="!ui.online"
          @click="remove"
        >
          <Icon name="trash" :size="18" />
          {{ confirmingDelete ? 'Tap again to delete' : 'Delete meal' }}
        </Button>
      </div>
      <p v-if="!isNew" class="px-2 text-center text-xs text-fg-muted">
        Changes apply from the next time you log this meal. What you already logged stays as it was.
      </p>
    </div>

    <IngredientSheet v-model:open="adding" :count="items.length" @add="addItem" />
  </AppShell>
</template>
