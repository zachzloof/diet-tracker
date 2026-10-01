<script setup lang="ts">
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import ItemEditor from '@/features/log/ItemEditor.vue'
import { applyItemEdit, type ItemEdit } from '@/features/log/item-edit'
import { formatGrams, formatKcal, formatNumber, formatQuantity } from '@/lib/format'
import type { MealDraftItem } from './meal-items'

/**
 * A saved meal's ingredients. Tap one to change its quantity or weight (everything about it
 * rescales), correct a single nutrient, or remove it. Used by the meal editor, where the
 * changes are saved, and by the card that logs a meal, where they are for that time only.
 */
const items = defineModel<MealDraftItem[]>({ required: true })

function patch(key: number, change: Partial<MealDraftItem>): void {
  items.value = items.value.map((item) => (item.key === key ? { ...item, ...change } : item))
}

function edit(item: MealDraftItem, change: ItemEdit): void {
  const result = applyItemEdit(item.base, item, change)
  patch(item.key, { ...result.item, base: result.base })
}

function remove(item: MealDraftItem): void {
  items.value = items.value.filter((other) => other.key !== item.key)
}
</script>

<template>
  <ul class="divide-y divide-border rounded-card border border-border" aria-label="Ingredients">
    <li v-for="item in items" :key="item.key">
      <button
        type="button"
        class="flex min-h-14 w-full items-start gap-3 px-4 py-3 text-left"
        :aria-expanded="item.expanded"
        @click="patch(item.key, { expanded: !item.expanded })"
      >
        <span class="min-w-0 flex-1">
          <span class="block text-base font-medium text-fg">{{ item.name }}</span>
          <span class="mt-0.5 block text-sm text-fg-muted">
            <template v-if="item.unit !== 'g'">
              {{ formatQuantity(item.quantity, item.unit) }} ·
            </template>
            {{ formatGrams(item.grams) }} ·
            <span class="text-protein">P {{ formatNumber(item.nutrients.protein_g, 0) }}</span>
            <span class="text-carbs"> C {{ formatNumber(item.nutrients.carbs_g, 0) }}</span>
            <span class="text-fat"> F {{ formatNumber(item.nutrients.fat_g, 0) }}</span>
          </span>
        </span>
        <span class="shrink-0 text-right">
          <span class="block text-base font-semibold text-fg">
            {{ formatKcal(item.nutrients.energy_kcal) }}
          </span>
          <Icon
            name="chevron-down"
            :size="18"
            class="mt-1 ml-auto text-fg-muted transition"
            :class="item.expanded && 'rotate-180'"
          />
        </span>
      </button>

      <div v-if="item.expanded" class="space-y-3 px-4 pb-4">
        <ItemEditor :item="item" :unit="item.unit" @edit="edit(item, $event)" />
        <div class="flex items-center justify-between gap-2">
          <span class="flex items-center gap-1.5 text-sm text-fg-muted">
            <Icon :name="item.foodId ? 'book' : 'pencil'" :size="16" class="shrink-0" />
            {{ item.foodId ? 'From My foods' : 'Entered by hand' }}
          </span>
          <IconButton label="Remove ingredient" icon="trash" @click="remove(item)" />
        </div>
      </div>
    </li>
  </ul>
</template>
