<script setup lang="ts">
import {
  MAX_ESTIMATE_CHARS,
  MEAL_LABELS,
  portionOf,
  roundFoodGroupServes,
  roundNutrientVector,
  type EstimateResponse,
  type Food,
  type LogEntryInput,
  type Meal,
} from '@diet-tracker/shared'
import { computed, reactive, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import NumberField from '@/components/ui/NumberField.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Sheet from '@/components/ui/Sheet.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Toggle from '@/components/ui/Toggle.vue'
import { ApiError } from '@/lib/api'
import { formatKcal } from '@/lib/format'
import { useUiStore } from '@/stores/ui'
import EstimateReview from './EstimateReview.vue'
import FoodPicker from './FoodPicker.vue'
import ManualFoodForm from './ManualFoodForm.vue'
import MealDayPicker from './MealDayPicker.vue'
import PortionPicker from './PortionPicker.vue'
import { emptyFoodForm, parseFoodForm } from './food-form'
import { useCreateEntries, useCreateFood, useEstimate } from './useLog'
import { useLocalDay } from './useLocalDay'

/**
 * The app's primary action. Three ways in: describe it (AI estimate, then review), pick
 * from My foods (no AI call), or enter a food by hand. Opened from the tab bar or any
 * screen through the UI store.
 */
const ui = useUiStore()
const { today, suggestion } = useLocalDay()
const estimate = useEstimate()
const create = useCreateEntries()
const createFood = useCreateFood()

const open = computed({
  get: () => ui.quickAdd.open,
  set: (value: boolean) => {
    if (!value) ui.closeQuickAdd()
  },
})

type Mode = 'describe' | 'foods' | 'manual'
const mode = ref<Mode>('describe')
const MODES: { value: Mode; label: string }[] = [
  { value: 'describe', label: 'Describe' },
  { value: 'foods', label: 'My foods' },
  { value: 'manual', label: 'Manual' },
]
const modeValue = computed({
  get: () => mode.value,
  set: (value: string) => {
    if (value === 'describe' || value === 'foods' || value === 'manual') mode.value = value
  },
})

/** The day to log to: the one the person was looking at, else their local today. */
const defaultDay = computed(() => ui.quickAdd.day ?? suggestion.value.day)
const saveError = ref<string | null>(null)

// --- Describe -----------------------------------------------------------------------------
const text = ref('')
const result = ref<EstimateResponse | null>(null)
const estimateError = computed(() => {
  const error = estimate.error.value
  if (!error) return null
  return error instanceof ApiError ? error : new ApiError(0, 'internal_error', error.message)
})

function runEstimate(input: string): void {
  saveError.value = null
  estimate.mutate(
    { text: input, at: new Date().toISOString() },
    {
      onSuccess: (response) => {
        result.value = {
          ...response,
          // Keep the day the person was viewing when they opened the sheet.
          day: ui.quickAdd.day ?? response.day,
        }
      },
    },
  )
}

function submitText(): void {
  const trimmed = text.value.trim()
  if (!trimmed || estimate.isPending.value || !ui.online) return
  runEstimate(trimmed)
}

function clarify(answer: string): void {
  text.value = `${text.value.trim()} (${answer})`
  runEstimate(text.value)
}

function editText(): void {
  result.value = null
  estimate.reset()
}

function addManuallyFromText(): void {
  manual.name = text.value.trim().slice(0, 120)
  estimate.reset()
  mode.value = 'manual'
}

// --- My foods -----------------------------------------------------------------------------
const picked = ref<Food | null>(null)

// --- Manual -------------------------------------------------------------------------------
const manual = reactive(emptyFoodForm())
const manualErrors = ref<Record<string, string[]>>({})
const manualAmount = ref<number | null>(null)
const manualSave = ref(true)
const manualMeal = ref<Meal>(suggestion.value.meal)
const manualDay = ref(defaultDay.value)

const manualPreview = computed(() => {
  const parsed = parseFoodForm(manual)
  if (!parsed.ok || manualAmount.value === null || manualAmount.value <= 0) return null
  const grams =
    parsed.data.basis === 'per_serving'
      ? manualAmount.value * (parsed.data.servingGrams ?? 0)
      : manualAmount.value
  return { food: parsed.data, grams, portion: portionOf(parsed.data, grams) }
})

async function submitManual(): Promise<void> {
  saveError.value = null
  const parsed = parseFoodForm(manual)
  if (!parsed.ok) {
    manualErrors.value = parsed.fieldErrors
    return
  }
  manualErrors.value = {}
  if (manualAmount.value === null || manualAmount.value <= 0) {
    manualErrors.value = { amount: ['Enter how much you ate'] }
    return
  }
  const food = parsed.data
  const perServing = food.basis === 'per_serving'
  const grams = perServing ? manualAmount.value * (food.servingGrams ?? 0) : manualAmount.value
  const portion = portionOf(food, grams)
  let foodId: string | null = null
  try {
    if (manualSave.value) foodId = (await createFood.mutateAsync(food)).id
  } catch (error) {
    saveError.value = error instanceof ApiError ? error.message : 'Could not save the food.'
    return
  }
  const entry: LogEntryInput = {
    name: food.name,
    quantity: manualAmount.value,
    unit: perServing ? (food.servingLabel ?? 'serving').slice(0, 30) : 'g',
    grams,
    nutrients: roundNutrientVector(portion.nutrients),
    foodGroups: roundFoodGroupServes(portion.foodGroups),
    source: foodId ? 'library' : 'manual',
    foodId,
    aiCallId: null,
    assumptions: [],
    confidence: null,
    saveToLibrary: false,
  }
  log({ day: manualDay.value, meal: manualMeal.value, entries: [entry] })
}

// --- Shared confirm -----------------------------------------------------------------------
function log(payload: { day: string; meal: Meal; entries: LogEntryInput[] }): void {
  saveError.value = null
  create.mutate(
    {
      day: payload.day,
      meal: payload.meal,
      loggedAt: new Date().toISOString(),
      entries: payload.entries,
    },
    {
      onSuccess: (response) => {
        const kcal = response.entries.reduce((sum, e) => sum + e.nutrients.energy_kcal, 0)
        ui.toast(
          `Added to ${MEAL_LABELS[payload.meal].toLowerCase()} · ${formatKcal(kcal)}`,
          'success',
        )
        ui.closeQuickAdd()
      },
      onError: (error: unknown) => {
        saveError.value =
          error instanceof ApiError ? error.message : 'Could not save. Please try again.'
      },
    },
  )
}

function reset(): void {
  mode.value = 'describe'
  text.value = ''
  result.value = null
  estimate.reset()
  create.reset()
  createFood.reset()
  picked.value = null
  Object.assign(manual, emptyFoodForm())
  manualErrors.value = {}
  manualAmount.value = null
  manualSave.value = true
  saveError.value = null
}

watch(open, (isOpen) => {
  if (isOpen) {
    reset()
    manualMeal.value = suggestion.value.meal
    manualDay.value = defaultDay.value
  }
})
</script>

<template>
  <Sheet
    v-model:open="open"
    title="Log food"
    :description="result ? undefined : 'Type what you ate and the app estimates the nutrients.'"
  >
    <div class="space-y-4">
      <SegmentedControl
        v-if="!result && !picked"
        v-model="modeValue"
        label="How to add"
        :options="MODES"
      />

      <!-- Describe -->
      <template v-if="mode === 'describe'">
        <div v-if="estimate.isPending.value" class="space-y-3" aria-busy="true" aria-live="polite">
          <p class="text-sm text-fg-muted">“{{ text.trim() }}”</p>
          <Skeleton v-for="i in 2" :key="i" class="h-20 w-full" rounded="card" />
          <p class="flex items-center gap-2 text-sm text-fg-muted">
            <Icon name="sparkles" :size="16" class="text-accent" /> Working out the nutrients…
          </p>
        </div>

        <EstimateReview
          v-else-if="result"
          :result="result"
          :text="text.trim()"
          :today="today"
          :saving="create.isPending.value"
          :error="saveError"
          @confirm="log"
          @clarify="clarify"
          @edit="editText"
        />

        <template v-else>
          <Textarea
            v-model="text"
            label="What did you eat?"
            placeholder="4 eggs and two slices of toast with butter"
            :maxlength="MAX_ESTIMATE_CHARS"
            :rows="3"
            enterkeyhint="send"
            :helper="`Quantities help. Missing ones are assumed and shown so you can fix them. ${text.length}/${MAX_ESTIMATE_CHARS}`"
            @submit="submitText"
          />

          <div
            v-if="estimateError"
            class="space-y-3 rounded-card border border-over/40 bg-over/10 p-3"
            role="alert"
          >
            <p class="flex gap-2 text-sm text-fg">
              <Icon name="alert" :size="18" class="mt-0.5 shrink-0 text-over" />
              {{ estimateError.message }}
            </p>
            <div class="flex gap-2">
              <Button
                v-if="estimateError.code !== 'ai_cap_reached'"
                variant="secondary"
                class="flex-1"
                @click="submitText"
              >
                Try again
              </Button>
              <Button variant="secondary" class="flex-1" @click="addManuallyFromText">
                Add manually
              </Button>
            </div>
          </div>

          <Button block :disabled="!text.trim() || !ui.online" @click="submitText">
            <Icon name="sparkles" :size="18" />
            {{ ui.online ? 'Estimate' : 'Offline' }}
          </Button>
        </template>
      </template>

      <!-- My foods -->
      <template v-else-if="mode === 'foods'">
        <PortionPicker
          v-if="picked"
          :food="picked"
          :today="today"
          :previous-day="suggestion.previousDay"
          :initial-day="defaultDay"
          :initial-meal="suggestion.meal"
          :saving="create.isPending.value"
          :error="saveError"
          @back="picked = null"
          @confirm="(p) => log({ day: p.day, meal: p.meal, entries: [p.entry] })"
        />
        <FoodPicker v-else @pick="picked = $event" @manual="mode = 'manual'" />
      </template>

      <!-- Manual -->
      <template v-else>
        <ManualFoodForm v-model="manual" :field-errors="manualErrors" />

        <div class="space-y-3 border-t border-border pt-4">
          <NumberField
            v-model="manualAmount"
            label="How much did you eat?"
            :unit="manual.basis === 'per_serving' ? manual.servingLabel || 'servings' : 'g'"
            :min="0"
            :step="manual.basis === 'per_serving' ? 0.5 : 10"
            :error="manualErrors.amount?.[0] ?? null"
          />
          <p v-if="manualPreview" class="text-sm text-fg-muted">
            That's {{ formatKcal(manualPreview.portion.nutrients.energy_kcal) }} for
            {{ Math.round(manualPreview.grams) }} g.
          </p>
          <Toggle
            v-model="manualSave"
            label="Save to My foods"
            description="Log it again later with one tap, no AI needed."
          />
          <MealDayPicker
            v-model:meal="manualMeal"
            v-model:day="manualDay"
            :today="today"
            :previous-day="suggestion.previousDay"
          />
          <p v-if="saveError" class="text-sm text-over" role="alert">{{ saveError }}</p>
          <Button
            block
            :loading="create.isPending.value || createFood.isPending.value"
            :disabled="!ui.online"
            @click="submitManual"
          >
            {{ ui.online ? `Add to ${manualMeal}` : 'Offline' }}
          </Button>
        </div>
      </template>
    </div>
  </Sheet>
</template>
