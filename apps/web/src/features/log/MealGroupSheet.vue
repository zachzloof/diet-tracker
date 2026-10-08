<script setup lang="ts">
import { type LogEntry, type Meal } from '@diet-tracker/shared'
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import Sheet from '@/components/ui/Sheet.vue'
import { ingredientCount } from '@/features/meals/meal-items'
import { ApiError } from '@/lib/api'
import { formatGrams, formatKcal, formatNumber, formatQuantity } from '@/lib/format'
import { useUiStore } from '@/stores/ui'
import MealDayPicker from './MealDayPicker.vue'
import { groupTotals } from './day-groups'
import { useDeleteGroup, useUpdateGroup } from './useLog'

/**
 * One logged meal ("Protein oats"): its ingredients, each a tap away from the ordinary item
 * editor, the meal's total, and the whole meal moved to another meal or day or removed in
 * one go (D33). The entries come from the live day log, so an ingredient edited from here
 * is reflected as soon as the sheet is back.
 */
const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  groupId: string | null
  name: string
  /** The ingredients, in log order; empty once the whole meal is gone. */
  entries: LogEntry[]
  today: string
}>()

const emit = defineEmits<{ select: [entry: LogEntry] }>()

const ui = useUiStore()
const move = useUpdateGroup()
const remove = useDeleteGroup()

const meal = ref<Meal>('snack')
const day = ref(props.today)
const confirmingDelete = ref(false)
const error = ref<string | null>(null)

const first = computed(() => props.entries[0] ?? null)
const totals = computed(() => groupTotals(props.entries))

watch(
  () => [open.value, props.groupId] as const,
  ([isOpen]) => {
    if (isOpen && first.value) {
      meal.value = first.value.meal
      day.value = first.value.day
      confirmingDelete.value = false
      error.value = null
      move.reset()
      remove.reset()
    }
  },
  { immediate: true },
)

const moved = computed(
  () => first.value !== null && (meal.value !== first.value.meal || day.value !== first.value.day),
)

function save(): void {
  if (!props.groupId || !first.value || !moved.value) return
  error.value = null
  move.mutate(
    {
      groupId: props.groupId,
      patch: {
        ...(meal.value !== first.value.meal ? { meal: meal.value } : {}),
        ...(day.value !== first.value.day ? { day: day.value } : {}),
      },
    },
    {
      onSuccess: () => {
        ui.toast('Moved', 'success')
        open.value = false
      },
      onError: (e: unknown) => {
        error.value = e instanceof ApiError ? e.message : 'Could not move. Please try again.'
      },
    },
  )
}

function del(): void {
  if (!props.groupId) return
  if (!confirmingDelete.value) {
    confirmingDelete.value = true
    return
  }
  error.value = null
  remove.mutate(
    { groupId: props.groupId, entryIds: props.entries.map((entry) => entry.id) },
    {
      onSuccess: () => {
        ui.toast('Removed', 'success')
        open.value = false
      },
      onError: (e: unknown) => {
        error.value = e instanceof ApiError ? e.message : 'Could not delete. Please try again.'
      },
    },
  )
}
</script>

<template>
  <Sheet v-model:open="open" :title="name">
    <div v-if="entries.length" class="space-y-4">
      <div class="flex items-baseline justify-between rounded-card bg-surface-2 p-3">
        <span class="text-sm text-fg-muted">
          {{ ingredientCount(entries.length) }} ·
          <span class="text-protein">P {{ formatNumber(totals.totals.protein_g, 0) }}</span>
          <span class="text-carbs"> C {{ formatNumber(totals.totals.carbs_g, 0) }}</span>
          <span class="text-fat"> F {{ formatNumber(totals.totals.fat_g, 0) }}</span>
        </span>
        <span class="text-xl font-bold text-fg">{{ formatKcal(totals.totals.energy_kcal) }}</span>
      </div>

      <ul class="divide-y divide-border rounded-card border border-border" aria-label="Ingredients">
        <li v-for="entry in entries" :key="entry.id">
          <button
            type="button"
            class="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-surface-2 active:bg-border/40"
            @click="emit('select', entry)"
          >
            <span class="min-w-0 flex-1">
              <span class="block truncate text-base text-fg">{{ entry.name }}</span>
              <span class="block text-xs text-fg-muted">
                {{ formatQuantity(entry.quantity, entry.unit)
                }}<template v-if="entry.unit !== 'g'"> · {{ formatGrams(entry.grams) }}</template>
              </span>
            </span>
            <span class="shrink-0 text-base font-semibold text-fg">
              {{ formatKcal(entry.nutrients.energy_kcal) }}
            </span>
            <Icon name="chevron-right" :size="18" class="shrink-0 text-fg-muted" />
          </button>
        </li>
      </ul>
      <p class="text-xs text-fg-muted">
        Tap an ingredient to change its amount or remove it from this meal.
      </p>

      <MealDayPicker v-model:meal="meal" v-model:day="day" :today="today" />

      <p v-if="error" class="text-sm text-over" role="alert">{{ error }}</p>

      <div class="space-y-2">
        <Button
          block
          :disabled="!moved || !ui.online"
          :loading="move.isPending.value"
          @click="save"
        >
          {{ ui.online ? 'Move the whole meal' : 'Offline' }}
        </Button>
        <Button
          block
          variant="destructive"
          :disabled="!ui.online"
          :loading="remove.isPending.value"
          @click="del"
        >
          <Icon name="trash" :size="18" />
          {{ confirmingDelete ? 'Tap again to delete the whole meal' : 'Delete the whole meal' }}
        </Button>
      </div>
    </div>
  </Sheet>
</template>
