<script setup lang="ts">
import type { Food, LogEntryInput, SavedMealItem } from '@diet-tracker/shared'
import { computed, reactive, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import NumberField from '@/components/ui/NumberField.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Sheet from '@/components/ui/Sheet.vue'
import Toggle from '@/components/ui/Toggle.vue'
import FoodPicker from '@/features/log/FoodPicker.vue'
import ManualFoodForm from '@/features/log/ManualFoodForm.vue'
import PortionPicker from '@/features/log/PortionPicker.vue'
import { emptyFoodForm, manualPortion, parseFoodForm } from '@/features/log/food-form'
import { useCreateFood } from '@/features/log/useLog'
import { ApiError } from '@/lib/api'
import { formatKcal } from '@/lib/format'
import { useUiStore } from '@/stores/ui'
import { ingredientCount } from './meal-items'

/**
 * Add ingredients to a saved meal: pick one from My foods and say how much, or type one in
 * by hand (and, by default, keep it in My foods for next time). The sheet stays open after
 * each one, because a meal is usually several.
 */
const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  /** How many ingredients the meal has so far, for the line that confirms an add. */
  count: number
}>()

const emit = defineEmits<{ add: [item: SavedMealItem] }>()

const ui = useUiStore()
const createFood = useCreateFood()

type Mode = 'foods' | 'manual'
const mode = ref<Mode>('foods')
const MODES: { value: Mode; label: string }[] = [
  { value: 'foods', label: 'My foods' },
  { value: 'manual', label: 'Manual' },
]
const modeValue = computed({
  get: () => mode.value,
  set: (value: string) => {
    if (value === 'foods' || value === 'manual') mode.value = value
  },
})

const picked = ref<Food | null>(null)
const lastAdded = ref<string | null>(null)

const manual = reactive(emptyFoodForm())
const manualErrors = ref<Record<string, string[]>>({})
const manualAmount = ref<number | null>(null)
const manualSave = ref(true)
const error = ref<string | null>(null)

const manualPreview = computed(() => {
  const parsed = parseFoodForm(manual)
  if (!parsed.ok || manualAmount.value === null || manualAmount.value <= 0) return null
  return manualPortion(parsed.data, manualAmount.value)
})

function resetManual(): void {
  Object.assign(manual, emptyFoodForm())
  manualErrors.value = {}
  manualAmount.value = null
  manualSave.value = true
  error.value = null
  createFood.reset()
}

watch(open, (isOpen) => {
  if (!isOpen) return
  mode.value = 'foods'
  picked.value = null
  lastAdded.value = null
  resetManual()
})

/** The portion picker speaks in log entries; an ingredient is the same numbers without a day. */
function fromEntry(entry: LogEntryInput): SavedMealItem {
  return {
    name: entry.name,
    quantity: entry.quantity,
    unit: entry.unit,
    grams: entry.grams,
    nutrients: entry.nutrients,
    foodGroups: entry.foodGroups,
    foodId: entry.foodId,
  }
}

function added(item: SavedMealItem): void {
  emit('add', item)
  lastAdded.value = item.name
  picked.value = null
  resetManual()
  mode.value = 'foods'
}

async function submitManual(): Promise<void> {
  error.value = null
  const parsed = parseFoodForm(manual)
  if (!parsed.ok) {
    manualErrors.value = parsed.fieldErrors
    return
  }
  manualErrors.value = {}
  if (manualAmount.value === null || manualAmount.value <= 0) {
    manualErrors.value = { amount: ['Enter how much goes in the meal'] }
    return
  }
  let foodId: string | null = null
  try {
    if (manualSave.value && ui.online) foodId = (await createFood.mutateAsync(parsed.data)).id
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Could not save the food.'
    return
  }
  added({ ...manualPortion(parsed.data, manualAmount.value), foodId })
}
</script>

<template>
  <Sheet
    v-model:open="open"
    title="Add ingredient"
    size="tall"
    description="Pick from My foods or type one in. Add as many as the meal needs."
  >
    <div class="space-y-4">
      <div
        v-if="lastAdded && !picked"
        class="flex items-center gap-3 rounded-card border border-met/40 bg-met/10 py-1.5 pr-1.5 pl-3"
        role="status"
      >
        <Icon name="check" :size="18" class="shrink-0 text-met" />
        <p class="min-w-0 flex-1 text-sm text-fg">
          Added {{ lastAdded }}. {{ ingredientCount(props.count) }} so far.
        </p>
        <Button variant="secondary" class="!h-11 shrink-0 !px-4" @click="open = false">
          Done
        </Button>
      </div>

      <SegmentedControl v-if="!picked" v-model="modeValue" label="How to add" :options="MODES" />

      <template v-if="mode === 'foods'">
        <PortionPicker
          v-if="picked"
          :food="picked"
          ingredient
          @back="picked = null"
          @confirm="(p) => added(fromEntry(p.entry))"
        />
        <FoodPicker v-else @pick="picked = $event" @manual="mode = 'manual'" />
      </template>

      <template v-else>
        <ManualFoodForm v-model="manual" :field-errors="manualErrors" />

        <div class="space-y-3 border-t border-border pt-4">
          <NumberField
            v-model="manualAmount"
            label="How much goes in the meal?"
            :unit="manual.basis === 'per_serving' ? manual.servingLabel || 'servings' : 'g'"
            :min="0"
            :step="manual.basis === 'per_serving' ? 0.5 : 10"
            :error="manualErrors.amount?.[0] ?? null"
          />
          <p v-if="manualPreview" class="text-sm text-fg-muted">
            That's {{ formatKcal(manualPreview.nutrients.energy_kcal) }} for
            {{ Math.round(manualPreview.grams) }} g.
          </p>
          <Toggle
            v-model="manualSave"
            label="Save to My foods"
            :description="
              ui.online
                ? 'Use it in other meals, or log it on its own, without typing it again.'
                : 'Needs a connection; the ingredient is still added to the meal.'
            "
            :disabled="!ui.online"
          />
          <p v-if="error" class="text-sm text-over" role="alert">{{ error }}</p>
          <Button block :loading="createFood.isPending.value" @click="submitManual">
            Add to meal
          </Button>
        </div>
      </template>
    </div>
  </Sheet>
</template>
