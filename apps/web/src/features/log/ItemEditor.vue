<script setup lang="ts">
import { NUTRIENTS, NUTRIENT_KEYS, type NutrientKey } from '@diet-tracker/shared'
import { computed, ref } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import NumberField from '@/components/ui/NumberField.vue'
import type { EditableItem, ItemEdit } from './item-edit'

/**
 * The fields for one item: quantity and weight (either rescales everything), then energy
 * and the macros, then every other nutrient behind a disclosure (each changes only itself).
 * Stateless apart from the disclosure: the parent applies each edit with `applyItemEdit`
 * so the review card and the entry sheet do the same arithmetic.
 */
const props = defineProps<{ item: EditableItem; unit: string }>()
const emit = defineEmits<{ edit: [change: ItemEdit] }>()

const HEADLINE: readonly NutrientKey[] = ['energy_kcal', 'protein_g', 'carbs_g', 'fat_g']
const MORE: readonly NutrientKey[] = NUTRIENT_KEYS.filter((key) => !HEADLINE.includes(key))

const moreOpen = ref(false)

/** "150 g" has no separate quantity to show; anything else gets both fields. */
const byWeight = computed(() => props.unit === 'g')

/** Fields show a rounded number; the item keeps full precision. */
const shown = (value: number, decimals: number) => {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
const stepFor = (key: NutrientKey) =>
  key === 'energy_kcal' || key.endsWith('_mg') || key === 'water_ml' ? 10 : 1

function setQuantity(value: number | null): void {
  if (value === null || value < 0) return
  emit('edit', { kind: 'quantity', value })
}

function setGrams(value: number | null): void {
  if (value === null || value < 0) return
  emit('edit', { kind: 'grams', value })
}

function setNutrient(key: NutrientKey, value: number | null): void {
  if (value === null || value < 0) return
  emit('edit', { kind: 'nutrient', key, value })
}
</script>

<template>
  <div class="space-y-3">
    <div class="grid gap-3" :class="byWeight ? 'grid-cols-1' : 'grid-cols-2'">
      <NumberField
        v-if="!byWeight"
        :model-value="shown(item.quantity, 2)"
        label="Quantity"
        :unit="unit"
        :min="0"
        :step="unit === 'ml' ? 10 : 0.5"
        @update:model-value="setQuantity"
      />
      <NumberField
        :model-value="shown(item.grams, 1)"
        :label="byWeight ? 'Amount' : 'Weight'"
        unit="g"
        :min="0"
        :step="10"
        @update:model-value="setGrams"
      />
    </div>
    <p class="text-xs text-fg-muted">
      Changing the {{ byWeight ? 'amount' : 'quantity or weight' }} rescales every number below.
      Changing a number below changes only that number.
    </p>

    <div class="grid grid-cols-2 gap-3">
      <NumberField
        v-for="key in HEADLINE"
        :key="key"
        :model-value="shown(item.nutrients[key], 1)"
        :label="`${NUTRIENTS[key].label} (${NUTRIENTS[key].unitLabel})`"
        :min="0"
        :step="stepFor(key)"
        @update:model-value="setNutrient(key, $event)"
      />
    </div>

    <button
      type="button"
      class="flex min-h-11 w-full items-center justify-between text-left text-sm font-semibold text-fg"
      :aria-expanded="moreOpen"
      @click="moreOpen = !moreOpen"
    >
      More nutrients
      <Icon
        name="chevron-down"
        :size="18"
        class="text-fg-muted transition"
        :class="moreOpen && 'rotate-180'"
      />
    </button>
    <div v-if="moreOpen" class="grid grid-cols-2 gap-3">
      <NumberField
        v-for="key in MORE"
        :key="key"
        :model-value="shown(item.nutrients[key], 2)"
        :label="`${NUTRIENTS[key].label} (${NUTRIENTS[key].unitLabel})`"
        :min="0"
        :step="stepFor(key)"
        @update:model-value="setNutrient(key, $event)"
      />
    </div>
  </div>
</template>
