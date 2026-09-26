<script setup lang="ts">
import {
  CONFIDENCE_LABELS,
  roundFoodGroupServes,
  roundNutrientVector,
  type LogEntry,
  type Meal,
} from '@diet-tracker/shared'
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import Sheet from '@/components/ui/Sheet.vue'
import { ApiError } from '@/lib/api'
import { formatGrams, formatKcal, formatNumber } from '@/lib/format'
import { useUiStore } from '@/stores/ui'
import ItemEditor from './ItemEditor.vue'
import MealDayPicker from './MealDayPicker.vue'
import {
  applyItemEdit,
  samePortion,
  snapshotItem,
  type EditableItem,
  type ItemEdit,
} from './item-edit'
import { useDeleteEntry, useUpdateEntry } from './useLog'

/**
 * Edit one logged item: quantity or weight (everything rescales), any single nutrient (only
 * that number), meal, day, or delete it.
 */
const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{ entry: LogEntry | null; today: string }>()

const ui = useUiStore()
const update = useUpdateEntry()
const remove = useDeleteEntry()

const draft = ref<EditableItem | null>(null)
const base = ref<EditableItem | null>(null)
const meal = ref<Meal>('snack')
const day = ref(props.today)
const confirmingDelete = ref(false)
const error = ref<string | null>(null)

watch(
  () => [open.value, props.entry] as const,
  ([isOpen, entry]) => {
    if (isOpen && entry) {
      draft.value = snapshotItem(entry)
      base.value = snapshotItem(entry)
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

function edit(change: ItemEdit): void {
  if (!draft.value || !base.value) return
  const result = applyItemEdit(base.value, draft.value, change)
  draft.value = result.item
  base.value = result.base
}

const portionChanged = computed(
  () => props.entry !== null && draft.value !== null && !samePortion(draft.value, props.entry),
)

const changed = computed(
  () =>
    props.entry !== null &&
    (portionChanged.value || meal.value !== props.entry.meal || day.value !== props.entry.day),
)

function save(): void {
  if (!props.entry || !draft.value || draft.value.quantity <= 0) return
  error.value = null
  const moved = meal.value !== props.entry.meal || day.value !== props.entry.day
  update.mutate(
    {
      id: props.entry.id,
      patch: {
        ...(portionChanged.value
          ? {
              quantity: draft.value.quantity,
              grams: draft.value.grams,
              nutrients: roundNutrientVector(draft.value.nutrients),
              foodGroups: roundFoodGroupServes(draft.value.foodGroups),
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
    <div v-if="entry && draft" class="space-y-4">
      <div class="flex items-baseline justify-between rounded-card bg-surface-2 p-3">
        <span class="text-sm text-fg-muted">
          {{ formatGrams(draft.grams) }} ·
          <span class="text-protein">P {{ formatNumber(draft.nutrients.protein_g, 0) }}</span>
          <span class="text-carbs"> C {{ formatNumber(draft.nutrients.carbs_g, 0) }}</span>
          <span class="text-fat"> F {{ formatNumber(draft.nutrients.fat_g, 0) }}</span>
        </span>
        <span class="text-xl font-bold text-fg">{{ formatKcal(draft.nutrients.energy_kcal) }}</span>
      </div>

      <ItemEditor :item="draft" :unit="entry.unit" @edit="edit" />

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
          :disabled="!changed || draft.quantity <= 0 || !ui.online"
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
