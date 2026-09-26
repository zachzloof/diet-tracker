<script setup lang="ts">
import {
  gramsForServings,
  portionOf,
  roundFoodGroupServes,
  roundNutrientVector,
  type Food,
  type LogEntryInput,
  type Meal,
} from '@diet-tracker/shared'
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import NumberField from '@/components/ui/NumberField.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { formatGrams, formatKcal, formatNumber } from '@/lib/format'
import { useUiStore } from '@/stores/ui'
import { basisLabel } from './food-form'
import MealDayPicker from './MealDayPicker.vue'

/** How much of a library food was eaten. Servings for per-serving foods, grams otherwise. */
const props = defineProps<{
  food: Food
  today: string
  previousDay: string | null
  initialDay: string
  initialMeal: Meal
  saving: boolean
  error: string | null
}>()

const emit = defineEmits<{
  confirm: [payload: { day: string; meal: Meal; entry: LogEntryInput }]
  back: []
}>()

const ui = useUiStore()
const mode = ref<'servings' | 'grams'>(props.food.basis === 'per_serving' ? 'servings' : 'grams')
const amount = ref<number | null>(props.food.basis === 'per_serving' ? 1 : 100)
const meal = ref<Meal>(props.initialMeal)
const day = ref(props.initialDay)

const MODES = [
  { value: 'servings', label: props.food.basis === 'per_serving' ? 'Servings' : '× 100 g' },
  { value: 'grams', label: 'Grams' },
]
const modeValue = computed({
  get: () => mode.value,
  set: (value: string) => {
    if (value !== 'servings' && value !== 'grams') return
    // Carry the amount across so switching does not change what is logged.
    if (value === 'grams' && mode.value === 'servings') amount.value = Math.round(grams.value)
    if (value === 'servings' && mode.value === 'grams') {
      amount.value = Math.round((grams.value / gramsForServings(props.food, 1)) * 100) / 100
    }
    mode.value = value
  },
})

const grams = computed(() => {
  const value = amount.value ?? 0
  return mode.value === 'servings' ? gramsForServings(props.food, value) : value
})
const portion = computed(() => portionOf(props.food, grams.value))
const servingUnit = computed(() =>
  props.food.basis === 'per_serving' ? (props.food.servingLabel ?? 'serving') : '× 100 g',
)

function confirm(): void {
  if (amount.value === null || amount.value <= 0) return
  emit('confirm', {
    day: day.value,
    meal: meal.value,
    entry: {
      name: props.food.name,
      quantity: mode.value === 'servings' ? amount.value : grams.value,
      unit: mode.value === 'servings' ? servingUnit.value.slice(0, 30) : 'g',
      grams: grams.value,
      nutrients: roundNutrientVector(portion.value.nutrients),
      foodGroups: roundFoodGroupServes(portion.value.foodGroups),
      source: 'library',
      foodId: props.food.id,
      aiCallId: null,
      assumptions: [],
      confidence: null,
      saveToLibrary: false,
    },
  })
}
</script>

<template>
  <div class="space-y-4">
    <div>
      <button type="button" class="text-sm font-semibold text-accent" @click="emit('back')">
        ‹ My foods
      </button>
      <p class="mt-1 text-base font-semibold text-fg">
        {{ food.name }}<span v-if="food.brand" class="text-fg-muted"> · {{ food.brand }}</span>
      </p>
      <p class="text-sm text-fg-muted">
        {{ formatKcal(food.nutrients.energy_kcal) }} {{ basisLabel(food) }}
      </p>
    </div>

    <SegmentedControl v-model="modeValue" label="Measure" :options="MODES" />
    <NumberField
      v-model="amount"
      label="How much"
      :unit="mode === 'servings' ? servingUnit : 'g'"
      :min="0"
      :step="mode === 'servings' ? 0.5 : 10"
    />

    <div class="rounded-card bg-surface-2 p-3">
      <div class="flex items-baseline justify-between">
        <span class="text-sm text-fg-muted">{{ formatGrams(grams) }}</span>
        <span class="text-xl font-bold text-fg">{{
          formatKcal(portion.nutrients.energy_kcal)
        }}</span>
      </div>
      <p class="mt-1 text-sm">
        <span class="font-semibold text-protein"
          >P {{ formatNumber(portion.nutrients.protein_g, 0) }}</span
        >
        <span class="mx-2 text-fg-muted">·</span>
        <span class="font-semibold text-carbs"
          >C {{ formatNumber(portion.nutrients.carbs_g, 0) }}</span
        >
        <span class="mx-2 text-fg-muted">·</span>
        <span class="font-semibold text-fat">F {{ formatNumber(portion.nutrients.fat_g, 0) }}</span>
      </p>
    </div>

    <MealDayPicker
      v-model:meal="meal"
      v-model:day="day"
      :today="today"
      :previous-day="previousDay"
    />

    <p v-if="error" class="text-sm text-over" role="alert">{{ error }}</p>
    <Button
      block
      :loading="saving"
      :disabled="!amount || amount <= 0 || !ui.online"
      @click="confirm"
    >
      {{ ui.online ? `Add to ${meal}` : 'Offline' }}
    </Button>
  </div>
</template>
