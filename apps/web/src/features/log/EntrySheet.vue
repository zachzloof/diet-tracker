<script setup lang="ts">
import {
  CONFIDENCE_LABELS,
  rescaleToQuantity,
  roundFoodGroupServes,
  roundNutrientVector,
  type LogEntry,
  type Meal,
} from '@diet-tracker/shared'
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import NumberField from '@/components/ui/NumberField.vue'
import Sheet from '@/components/ui/Sheet.vue'
import { ApiError } from '@/lib/api'
import { formatGrams, formatKcal, formatNumber } from '@/lib/format'
import { useUiStore } from '@/stores/ui'
import MealDayPicker from './MealDayPicker.vue'
import { useDeleteEntry, useUpdateEntry } from './useLog'

/** Edit one logged item: quantity (numbers rescale), meal, day, or delete it. */
const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{ entry: LogEntry | null; today: string }>()

const ui = useUiStore()
const update = useUpdateEntry()
const remove = useDeleteEntry()

const quantity = ref<number | null>(null)
const meal = ref<Meal>('snack')
const day = ref(props.today)
const confirmingDelete = ref(false)
const error = ref<string | null>(null)

watch(
  () => [open.value, props.entry] as const,
  ([isOpen, entry]) => {
    if (isOpen && entry) {
      quantity.value = entry.quantity
      meal.value = entry.meal
      day.value = entry.day
      confirmingDelete.value = false
      error.value = null
      update.reset()
      remove.reset()
    }
  },
  { immediate: true },
)

const scaled = computed(() => {
  if (!props.entry || quantity.value === null || quantity.value < 0) return props.entry
  return rescaleToQuantity(props.entry, quantity.value)
})

const changed = computed(
  () =>
    props.entry !== null &&
    (quantity.value !== props.entry.quantity ||
      meal.value !== props.entry.meal ||
      day.value !== props.entry.day),
)

function save(): void {
  if (!props.entry || !scaled.value || quantity.value === null || quantity.value <= 0) return
  error.value = null
  const moved = meal.value !== props.entry.meal || day.value !== props.entry.day
  update.mutate(
    {
      id: props.entry.id,
      patch: {
        ...(quantity.value !== props.entry.quantity
          ? {
              quantity: quantity.value,
              grams: scaled.value.grams,
              nutrients: roundNutrientVector(scaled.value.nutrients),
              foodGroups: roundFoodGroupServes(scaled.value.foodGroups),
            }
          : {}),
        ...(meal.value !== props.entry.meal ? { meal: meal.value } : {}),
        ...(day.value !== props.entry.day ? { day: day.value } : {}),
      },
    },
    {
      onSuccess: () => {
        ui.toast(moved ? 'Moved' : 'Saved', 'success')
        open.value = false
      },
      onError: (e: unknown) => {
        error.value = e instanceof ApiError ? e.message : 'Could not save. Please try again.'
      },
    },
  )
}

function del(): void {
  if (!props.entry) return
  if (!confirmingDelete.value) {
    confirmingDelete.value = true
    return
  }
  error.value = null
  remove.mutate(props.entry.id, {
    onSuccess: () => {
      ui.toast('Removed', 'success')
      open.value = false
    },
    onError: (e: unknown) => {
      error.value = e instanceof ApiError ? e.message : 'Could not delete. Please try again.'
    },
  })
}
</script>

<template>
  <Sheet v-model:open="open" :title="entry?.name ?? ''">
    <div v-if="entry && scaled" class="space-y-4">
      <div class="flex items-baseline justify-between rounded-card bg-surface-2 p-3">
        <span class="text-sm text-fg-muted">
          {{ formatGrams(scaled.grams) }} ·
          <span class="text-protein">P {{ formatNumber(scaled.nutrients.protein_g, 0) }}</span>
          <span class="text-carbs"> C {{ formatNumber(scaled.nutrients.carbs_g, 0) }}</span>
          <span class="text-fat"> F {{ formatNumber(scaled.nutrients.fat_g, 0) }}</span>
        </span>
        <span class="text-xl font-bold text-fg">{{
          formatKcal(scaled.nutrients.energy_kcal)
        }}</span>
      </div>

      <NumberField
        v-model="quantity"
        label="Quantity"
        :unit="entry.unit"
        :min="0"
        :step="entry.unit === 'g' || entry.unit === 'ml' ? 10 : 0.5"
      />

      <ul v-if="entry.assumptions.length || entry.confidence" class="space-y-1">
        <li v-if="entry.confidence" class="text-xs text-fg-muted">
          AI estimate · {{ CONFIDENCE_LABELS[entry.confidence] }}
        </li>
        <li
          v-for="assumption in entry.assumptions"
          :key="assumption"
          class="flex gap-2 text-sm text-fg-muted"
        >
          <Icon name="info" :size="16" class="mt-0.5 shrink-0" />
          {{ assumption }}
        </li>
      </ul>

      <MealDayPicker v-model:meal="meal" v-model:day="day" :today="today" />

      <p v-if="error" class="text-sm text-over" role="alert">{{ error }}</p>

      <div class="space-y-2">
        <Button
          block
          :disabled="!changed || !quantity || quantity <= 0 || !ui.online"
          :loading="update.isPending.value"
          @click="save"
        >
          {{ ui.online ? 'Save' : 'Offline' }}
        </Button>
        <Button
          block
          variant="destructive"
          :disabled="!ui.online"
          :loading="remove.isPending.value"
          @click="del"
        >
          <Icon name="trash" :size="18" />
          {{ confirmingDelete ? 'Tap again to delete' : 'Delete' }}
        </Button>
      </div>
    </div>
  </Sheet>
</template>
