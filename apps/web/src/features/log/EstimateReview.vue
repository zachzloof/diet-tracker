<script setup lang="ts">
import {
  CONFIDENCE_LABELS,
  roundFoodGroupServes,
  roundNutrientVector,
  sumPortions,
  type Confidence,
  type EstimateResponse,
  type FoodGroupServes,
  type LogEntryInput,
  type Meal,
  type NutrientVector,
} from '@diet-tracker/shared'
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Chip, { type ChipTone } from '@/components/ui/Chip.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Input from '@/components/ui/Input.vue'
import { formatGrams, formatKcal, formatNumber, formatQuantity } from '@/lib/format'
import { useUiStore } from '@/stores/ui'
import ItemEditor from './ItemEditor.vue'
import MealDayPicker from './MealDayPicker.vue'
import { applyItemEdit, snapshotItem, type EditableItem, type ItemEdit } from './item-edit'

/**
 * The review card: every item the estimator found, with its grams, key nutrients,
 * confidence, assumptions and, for a named product, the page its label came from. Tap an
 * item to change the quantity or weight (everything rescales) or to correct any single
 * nutrient (only that number changes), remove it, choose meal and day, then confirm.
 * Nothing is saved until the confirm button.
 */
const props = defineProps<{
  result: EstimateResponse
  text: string
  today: string
  saving: boolean
  error: string | null
}>()

const emit = defineEmits<{
  confirm: [payload: { day: string; meal: Meal; entries: LogEntryInput[] }]
  clarify: [answer: string]
  edit: []
}>()

interface ReviewItem extends EditableItem {
  key: number
  name: string
  brand: string | null
  sourceUrl: string | null
  unit: string
  quantity: number
  grams: number
  nutrients: NutrientVector
  foodGroups: FoodGroupServes
  confidence: Confidence
  assumptions: string[]
  matchedFoodId: string | null
  /** What portion edits scale from; see item-edit.ts. */
  base: EditableItem
  /** Save to My foods on confirm. Defaults on for confident items, per the skill. */
  save: boolean
  edited: boolean
  expanded: boolean
}

const ui = useUiStore()
const items = ref<ReviewItem[]>([])
const meal = ref<Meal>(props.result.meal)
const day = ref(props.result.day)
const answer = ref('')

watch(
  () => props.result,
  (result) => {
    items.value = result.estimate.items.map((item, index) => ({
      key: index,
      name: item.name,
      brand: item.brand,
      sourceUrl: item.source_url,
      unit: item.unit,
      quantity: item.quantity,
      grams: item.grams,
      nutrients: item.nutrients,
      foodGroups: item.food_groups,
      confidence: item.confidence,
      assumptions: item.assumptions,
      matchedFoodId: item.matched_food_id,
      base: snapshotItem({
        quantity: item.quantity,
        grams: item.grams,
        nutrients: item.nutrients,
        foodGroups: item.food_groups,
      }),
      save: item.confidence === 'high' && item.matched_food_id === null,
      edited: false,
      expanded: false,
    }))
    meal.value = result.meal
    day.value = result.day
    answer.value = ''
  },
  { immediate: true },
)

const totals = computed(() => sumPortions(items.value))

const TONE: Record<Confidence, ChipTone> = { high: 'met', medium: 'close', low: 'short' }

/** The brand line is only worth showing when the name does not already say it. */
function brandLine(item: ReviewItem): string | null {
  if (!item.brand) return null
  return item.name.toLowerCase().includes(item.brand.toLowerCase()) ? null : item.brand
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'the web'
  }
}

function edit(item: ReviewItem, change: ItemEdit): void {
  const result = applyItemEdit(item.base, item, change)
  Object.assign(item, result.item, { base: result.base, edited: true })
}

function remove(item: ReviewItem): void {
  items.value = items.value.filter((other) => other.key !== item.key)
}

function confirm(): void {
  if (items.value.length === 0) return
  emit('confirm', {
    day: day.value,
    meal: meal.value,
    entries: items.value.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      grams: item.grams,
      nutrients: roundNutrientVector(item.nutrients),
      foodGroups: roundFoodGroupServes(item.foodGroups),
      source: 'ai',
      foodId: item.matchedFoodId,
      aiCallId: props.result.aiCallId,
      assumptions: item.assumptions,
      confidence: item.confidence,
      brand: item.brand,
      saveToLibrary: item.save && item.matchedFoodId === null,
    })),
  })
}
</script>

<template>
  <div class="space-y-4" aria-live="polite">
    <div class="flex items-start justify-between gap-2">
      <p class="min-w-0 text-sm text-fg-muted">
        “<span class="text-fg">{{ text }}</span
        >”
      </p>
      <button
        type="button"
        class="shrink-0 text-sm font-semibold text-accent"
        @click="emit('edit')"
      >
        Edit text
      </button>
    </div>

    <div
      v-if="result.estimate.clarifying_question"
      class="space-y-2 rounded-card border border-close/40 bg-close/10 p-3"
      role="status"
    >
      <p class="flex gap-2 text-sm text-fg">
        <Icon name="info" :size="18" class="mt-0.5 shrink-0 text-close" />
        {{ result.estimate.clarifying_question }}
      </p>
      <div class="flex gap-2">
        <div class="min-w-0 flex-1">
          <Input v-model="answer" label="Your answer" placeholder="e.g. 1 scoop with water" />
        </div>
        <Button
          variant="secondary"
          class="mt-[26px] shrink-0"
          :disabled="!answer.trim() || saving"
          @click="emit('clarify', answer.trim())"
        >
          Update
        </Button>
      </div>
      <p class="text-xs text-fg-muted">Or keep the estimate below as it is.</p>
    </div>

    <ul v-if="items.length" class="divide-y divide-border rounded-card border border-border">
      <li v-for="item in items" :key="item.key">
        <button
          type="button"
          class="flex w-full items-start gap-3 px-4 py-3 text-left"
          :aria-expanded="item.expanded"
          @click="item.expanded = !item.expanded"
        >
          <span class="min-w-0 flex-1">
            <span class="block text-base font-medium text-fg">{{ item.name }}</span>
            <span class="mt-0.5 block text-sm text-fg-muted">
              <template v-if="brandLine(item)">{{ brandLine(item) }} · </template>
              {{ formatQuantity(item.quantity, item.unit) }} · {{ formatGrams(item.grams) }} ·
              <span class="text-protein">P {{ formatNumber(item.nutrients.protein_g, 0) }}</span>
              <span class="text-carbs"> C {{ formatNumber(item.nutrients.carbs_g, 0) }}</span>
              <span class="text-fat"> F {{ formatNumber(item.nutrients.fat_g, 0) }}</span>
            </span>
            <span class="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Chip :tone="TONE[item.confidence]" class="!h-6 !px-2 !text-xs">
                {{ CONFIDENCE_LABELS[item.confidence] }}
              </Chip>
              <Chip v-if="item.sourceUrl" tone="accent" class="!h-6 !px-2 !text-xs">
                <Icon name="globe" :size="12" /> Label found online
              </Chip>
              <Chip v-if="item.edited" tone="neutral" class="!h-6 !px-2 !text-xs">
                <Icon name="pencil" :size="12" /> Edited
              </Chip>
              <Chip v-if="item.matchedFoodId" tone="accent" class="!h-6 !px-2 !text-xs">
                <Icon name="book" :size="12" /> From My foods
              </Chip>
              <Chip v-else-if="item.save" tone="neutral" class="!h-6 !px-2 !text-xs">
                <Icon name="bookmark" :size="12" /> Will save
              </Chip>
            </span>
          </span>
          <span class="shrink-0 text-right">
            <span class="block text-base font-semibold text-fg">
              {{ formatKcal(item.nutrients.energy_kcal) }}
            </span>
            <Icon
              name="chevron-down"
              :size="18"
              class="ml-auto mt-1 text-fg-muted transition"
              :class="item.expanded && 'rotate-180'"
            />
          </span>
        </button>

        <div v-if="item.expanded" class="space-y-3 px-4 pb-4">
          <ItemEditor :item="item" :unit="item.unit" @edit="edit(item, $event)" />

          <a
            v-if="item.sourceUrl"
            :href="item.sourceUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="flex min-h-11 items-center gap-2 text-sm font-semibold text-accent"
          >
            <Icon name="globe" :size="16" class="shrink-0" />
            <span class="min-w-0 truncate">Label read from {{ hostOf(item.sourceUrl) }}</span>
            <Icon name="share" :size="14" class="shrink-0" />
          </a>

          <ul v-if="item.assumptions.length" class="space-y-1">
            <li
              v-for="assumption in item.assumptions"
              :key="assumption"
              class="flex gap-2 text-sm text-fg-muted"
            >
              <Icon name="info" :size="16" class="mt-0.5 shrink-0" />
              {{ assumption }}
            </li>
          </ul>
          <div class="flex items-center justify-between gap-2">
            <button
              v-if="!item.matchedFoodId"
              type="button"
              class="flex min-h-11 items-center gap-1.5 text-sm font-semibold"
              :class="item.save ? 'text-accent' : 'text-fg-muted'"
              :aria-pressed="item.save"
              @click="item.save = !item.save"
            >
              <Icon name="bookmark" :size="16" />
              {{ item.save ? 'Saving to My foods' : 'Save to My foods' }}
            </button>
            <span v-else class="text-sm text-fg-muted">Matched a food you saved</span>
            <IconButton label="Remove item" icon="trash" @click="remove(item)" />
          </div>
        </div>
      </li>
    </ul>

    <p v-else class="text-sm text-fg-muted">
      Every item was removed. Edit the text to start again.
    </p>

    <div
      v-if="items.length"
      class="flex items-baseline justify-between rounded-card bg-surface-2 p-3"
    >
      <span class="text-sm text-fg-muted">
        {{ items.length }} item{{ items.length === 1 ? '' : 's' }} ·
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
      :previous-day="result.previousDay"
    />

    <p v-if="error" class="text-sm text-over" role="alert">{{ error }}</p>
    <Button block :loading="saving" :disabled="items.length === 0" @click="confirm">
      {{ ui.online ? `Add to ${meal}` : `Add to ${meal} (offline)` }}
    </Button>
    <p class="text-center text-xs text-fg-muted">
      Estimated by AI. Tap an item to change the amount, fix any number or read its assumptions.
      <template v-if="result.callsRemaining < 10">
        {{ result.callsRemaining }} estimates left today.
      </template>
    </p>
  </div>
</template>
