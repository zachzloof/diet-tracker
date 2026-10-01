<script setup lang="ts">
import {
  MAX_SAVED_MEAL_PORTIONS,
  savedMealEntries,
  sumPortions,
  type LogEntryInput,
  type Meal,
  type SavedMeal,
} from '@diet-tracker/shared'
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import NumberField from '@/components/ui/NumberField.vue'
import MealDayPicker from '@/features/log/MealDayPicker.vue'
import { formatKcal, formatNumber } from '@/lib/format'
import { useUiStore } from '@/stores/ui'
import MealItemList from './MealItemList.vue'
import {
  fromDraftItem,
  ingredientCount,
  scaleDraftItems,
  toDraftItem,
  type MealDraftItem,
} from './meal-items'

/**
 * Drop a saved meal into the log: how many portions, which meal of the day and which day,
 * then confirm. Nothing needs typing and no AI call is made. An ingredient can be changed
 * or left out for this one time; the saved meal itself is only changed in the editor.
 */
const props = defineProps<{
  saved: SavedMeal
  today: string
  previousDay: string | null
  initialDay: string
  initialMeal: Meal
  saving: boolean
  error: string | null
  /** Shows the meal's name with a way back to the list (the quick-add sheet). */
  backLabel?: string
}>()

const emit = defineEmits<{
  confirm: [payload: { day: string; meal: Meal; entries: LogEntryInput[]; savedMealId: string }]
  back: []
}>()

const ui = useUiStore()
const items = ref<MealDraftItem[]>([])
const portions = ref<number | null>(1)
/** The portions the items on screen are currently scaled to. */
const applied = ref(1)
const meal = ref<Meal>(props.initialMeal)
const day = ref(props.initialDay)

watch(
  () => props.saved,
  (saved) => {
    items.value = saved.items.map(toDraftItem)
    portions.value = 1
    applied.value = 1
  },
  { immediate: true },
)

const portionsValid = computed(
  () => portions.value !== null && portions.value > 0 && portions.value <= MAX_SAVED_MEAL_PORTIONS,
)

// Typing passes through empty and 0; the ingredients only rescale on a usable number.
watch(portions, (next) => {
  if (next === null || !portionsValid.value || next === applied.value) return
  items.value = scaleDraftItems(items.value, next / applied.value)
  applied.value = next
})

const totals = computed(() => sumPortions(items.value))
const hasZero = computed(() => items.value.some((item) => !(item.quantity > 0)))
const canLog = computed(() => items.value.length > 0 && portionsValid.value && !hasZero.value)

function confirm(): void {
  if (!canLog.value) return
  emit('confirm', {
    day: day.value,
    meal: meal.value,
    // The items are already scaled to the portions on screen.
    entries: savedMealEntries(items.value.map(fromDraftItem)),
    savedMealId: props.saved.id,
  })
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="backLabel">
      <button type="button" class="text-sm font-semibold text-accent" @click="emit('back')">
        ‹ {{ backLabel }}
      </button>
      <p class="mt-1 text-base font-semibold text-fg">{{ saved.name }}</p>
    </div>

    <NumberField
      v-model="portions"
      label="How many portions"
      :min="0.5"
      :max="MAX_SAVED_MEAL_PORTIONS"
      :step="0.5"
      :error="
        portions !== null && portions > MAX_SAVED_MEAL_PORTIONS
          ? `Up to ${MAX_SAVED_MEAL_PORTIONS} portions at a time`
          : null
      "
    />

    <MealItemList v-if="items.length" v-model="items" />
    <p v-else class="text-sm text-fg-muted">
      Every ingredient was removed. Go back and pick the meal again to start over.
    </p>

    <div
      v-if="items.length"
      class="flex items-baseline justify-between rounded-card bg-surface-2 p-3"
    >
      <span class="text-sm text-fg-muted">
        {{ ingredientCount(items.length) }} ·
        <span class="text-protein">P {{ formatNumber(totals.totals.protein_g, 0) }}</span>
        <span class="text-carbs"> C {{ formatNumber(totals.totals.carbs_g, 0) }}</span>
        <span class="text-fat"> F {{ formatNumber(totals.totals.fat_g, 0) }}</span>
      </span>
      <span class="text-xl font-bold text-fg">{{ formatKcal(totals.totals.energy_kcal) }}</span>
    </div>

    <MealDayPicker
      v-model:meal="meal"
      v-model:day="day"
      :today="today"
      :previous-day="previousDay"
    />

    <p v-if="hasZero" class="text-sm text-over" role="alert">
      An ingredient is set to 0. Give it an amount or remove it.
    </p>
    <p v-if="error" class="text-sm text-over" role="alert">{{ error }}</p>
    <Button block :loading="saving" :disabled="!canLog" @click="confirm">
      {{ ui.online ? `Add to ${meal}` : `Add to ${meal} (offline)` }}
    </Button>
    <p class="text-center text-xs text-fg-muted">
      Tap an ingredient to change or remove it for this time. The saved meal stays as it is.
    </p>
  </div>
</template>
