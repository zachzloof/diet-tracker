<script setup lang="ts">
import { MEAL_LABELS, type MealCard } from '@diet-tracker/shared'
import { ref } from 'vue'
import { useCreateMeal } from '@/features/meals/useMeals'
import { ApiError } from '@/lib/api'
import { formatKcal, formatNumber, formatQuantity } from '@/lib/format'
import CardFrame from './CardFrame.vue'

/** A saved meal built from My foods; Save goes through `POST /meals` like the meal editor. */
const props = defineProps<{ card: MealCard; pending?: boolean }>()
const emit = defineEmits<{ confirmed: []; dismiss: [] }>()

const create = useCreateMeal()
const error = ref<string | null>(null)

function confirm(): void {
  error.value = null
  create.mutate(
    { name: props.card.name, items: props.card.items },
    {
      onSuccess: () => emit('confirmed'),
      onError: (e: unknown) => {
        error.value = e instanceof ApiError ? e.message : 'Could not save the meal.'
      },
    },
  )
}
</script>

<template>
  <CardFrame
    icon="utensils"
    :title="`Save “${card.name}” to meals`"
    :state="card.state"
    confirm-label="Save to meals"
    confirmed-label="Saved"
    :pending="pending"
    :saving="create.isPending.value"
    :error="error"
    @confirm="confirm"
    @dismiss="emit('dismiss')"
  >
    <ul class="divide-y divide-border rounded-card border border-border">
      <li
        v-for="(item, i) in card.items"
        :key="i"
        class="flex items-center justify-between gap-3 px-3 py-2 text-sm"
      >
        <span class="min-w-0">
          <span class="block truncate text-fg">{{ item.name }}</span>
          <span class="block text-fg-muted">
            {{ formatQuantity(item.quantity, item.unit) }} · {{ formatNumber(item.grams, 0) }} g
          </span>
        </span>
        <span class="shrink-0 tabular-nums text-fg">{{
          formatKcal(item.nutrients.energy_kcal)
        }}</span>
      </li>
    </ul>
    <div class="mt-2 flex items-baseline justify-between rounded-card bg-surface-2 px-3 py-2">
      <span class="text-sm text-fg-muted">
        {{ card.items.length }} ingredient{{ card.items.length === 1 ? '' : 's' }} ·
        <span class="text-protein">P {{ card.totals.protein_g }}</span>
        <span class="text-carbs"> C {{ card.totals.carbs_g }}</span>
        <span class="text-fat"> F {{ card.totals.fat_g }}</span>
        <template v-if="card.meal"> · {{ MEAL_LABELS[card.meal] }}</template>
      </span>
      <span class="text-lg font-bold text-fg tabular-nums">{{
        formatKcal(card.totals.energy_kcal)
      }}</span>
    </div>
    <p v-if="card.state === 'drafted'" class="mt-2 text-xs text-fg-muted">
      Saved meals log in a few taps from the Log sheet, with no estimate.
    </p>
  </CardFrame>
</template>
