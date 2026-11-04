<script setup lang="ts">
import { MEAL_LABELS, type EstimateCard, type LogEntryInput, type Meal } from '@diet-tracker/shared'
import { computed, ref } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import EstimateReview from '@/features/log/EstimateReview.vue'
import { slotName } from '@/features/log/log-slot'
import { useCreateEntries } from '@/features/log/useLog'
import { useLocalDay } from '@/features/log/useLocalDay'
import { ApiError } from '@/lib/api'
import { formatKcal, formatNumber } from '@/lib/format'
import { useUiStore } from '@/stores/ui'
import CardFrame from './CardFrame.vue'

/**
 * The estimator's answer as the review card the quick-add sheet shows: tap an item to fix
 * it, pick the meal and day, confirm. The confirm is the same `POST /log/entries` with the
 * same "save to My foods" and "Add to meals" behaviour. A clarifying question goes back to
 * the coach as the next message.
 */
const props = defineProps<{ card: EstimateCard; pending?: boolean }>()
const emit = defineEmits<{ confirmed: []; dismiss: []; clarify: [text: string] }>()

const ui = useUiStore()
const { today } = useLocalDay()
const create = useCreateEntries()
const error = ref<string | null>(null)

const items = computed(() => props.card.result.estimate.items)
const totalKcal = computed(() =>
  items.value.reduce((sum, item) => sum + item.nutrients.energy_kcal, 0),
)

function log(payload: {
  day: string
  meal: Meal
  planned: boolean
  entries: LogEntryInput[]
  saveAsMeal?: { name: string }
}): void {
  error.value = null
  create.mutate(
    {
      day: payload.day,
      meal: payload.meal,
      planned: payload.planned,
      loggedAt: new Date().toISOString(),
      entries: payload.entries,
      ...(payload.saveAsMeal ? { saveAsMeal: payload.saveAsMeal } : {}),
    },
    {
      onSuccess: (response) => {
        const kcal = response.entries.reduce((sum, e) => sum + e.nutrients.energy_kcal, 0)
        const andMeal = payload.saveAsMeal ? ` · saved as "${payload.saveAsMeal.name}"` : ''
        ui.toast(
          response.queued
            ? `Saved offline · ${formatKcal(kcal)}${andMeal}. It will be sent when you're back online.`
            : `Added to ${slotName(payload.meal, payload.planned)} · ${formatKcal(kcal)}${andMeal}`,
          'success',
        )
        emit('confirmed')
      },
      onError: (e: unknown) => {
        error.value = e instanceof ApiError ? e.message : 'Could not save. Please try again.'
      },
    },
  )
}
</script>

<template>
  <CardFrame
    icon="utensils"
    :title="`Log “${card.text}”`"
    :state="card.state"
    :confirm-label="`Add to ${MEAL_LABELS[card.result.meal].toLowerCase()}`"
    confirmed-label="Logged"
    :pending="pending"
    own-confirm
    @dismiss="emit('dismiss')"
  >
    <EstimateReview
      v-if="card.state === 'drafted' && !pending"
      :result="card.result"
      :text="card.text"
      :today="today"
      :saving="create.isPending.value"
      :error="error"
      hide-edit
      @confirm="log"
      @clarify="(answer) => emit('clarify', `${card.text} (${answer})`)"
    />
    <ul v-else class="divide-y divide-border rounded-card border border-border">
      <li
        v-for="(item, i) in items"
        :key="i"
        class="flex items-center justify-between gap-3 px-3 py-2 text-sm"
      >
        <span class="min-w-0">
          <span class="block truncate text-fg">{{ item.name }}</span>
          <span class="block text-fg-muted">
            {{ formatNumber(item.quantity) }} {{ item.unit }} · {{ formatNumber(item.grams, 0) }} g
          </span>
        </span>
        <span class="shrink-0 tabular-nums text-fg">{{
          formatKcal(item.nutrients.energy_kcal)
        }}</span>
      </li>
      <li class="flex items-center justify-between gap-3 px-3 py-2 text-sm">
        <span class="flex items-center gap-1.5 text-fg-muted">
          <Icon name="sparkles" :size="14" /> {{ MEAL_LABELS[card.result.meal] }},
          {{ card.result.day }}
        </span>
        <span class="font-semibold tabular-nums text-fg">{{ formatKcal(totalKcal) }}</span>
      </li>
    </ul>
  </CardFrame>
</template>
