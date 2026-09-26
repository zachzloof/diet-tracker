<script setup lang="ts">
import { FOOD_GROUPS, FOOD_GROUP_KEYS, NUTRIENTS, foodBasisSchema } from '@diet-tracker/shared'
import { computed, ref } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import Input from '@/components/ui/Input.vue'
import NumberField from '@/components/ui/NumberField.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { LABEL_NUTRIENTS, MORE_NUTRIENTS, type FoodFormState } from './food-form'

/**
 * A label-style food form: name, basis, the nine numbers on a packet, then the rest behind
 * two disclosures. The parent owns the state (see food-form.ts) and the errors.
 */
const form = defineModel<FoodFormState>({ required: true })

defineProps<{ fieldErrors: Record<string, string[]> }>()

const BASES = [
  { value: 'per_100g', label: 'Per 100 g' },
  { value: 'per_serving', label: 'Per serving' },
]
const basis = computed({
  get: () => form.value.basis,
  set: (value: string) => {
    const parsed = foodBasisSchema.safeParse(value)
    if (parsed.success) form.value.basis = parsed.data
  },
})

const moreOpen = ref(false)
const groupsOpen = ref(false)

const stepFor = (key: string) => (key === 'energy_kcal' ? 10 : key.endsWith('_mg') ? 10 : 1)
</script>

<template>
  <div class="space-y-4">
    <Input
      v-model="form.name"
      label="Name"
      placeholder="Greek yoghurt"
      autocomplete="off"
      :error="fieldErrors.name?.[0] ?? null"
    />
    <Input
      v-model="form.brand"
      label="Brand (optional)"
      placeholder="Fage"
      autocomplete="off"
      :error="fieldErrors.brand?.[0] ?? null"
    />

    <SegmentedControl v-model="basis" label="Values are" :options="BASES" />
    <div v-if="form.basis === 'per_serving'" class="grid grid-cols-2 gap-3">
      <NumberField
        v-model="form.servingGrams"
        label="Serving size"
        unit="g"
        :min="0"
        :step="5"
        placeholder="35"
        :error="fieldErrors.servingGrams?.[0] ?? null"
      />
      <Input
        v-model="form.servingLabel"
        label="Serving name"
        placeholder="1 scoop"
        autocomplete="off"
        :error="fieldErrors.servingLabel?.[0] ?? null"
      />
    </div>

    <div class="grid grid-cols-2 gap-3">
      <NumberField
        v-for="key in LABEL_NUTRIENTS"
        :key="key"
        v-model="form.nutrients[key]"
        :label="NUTRIENTS[key].label"
        :unit="NUTRIENTS[key].unitLabel"
        :min="0"
        :step="stepFor(key)"
        placeholder="0"
        :error="fieldErrors[`nutrients.${key}`]?.[0] ?? null"
      />
    </div>

    <button
      type="button"
      class="flex min-h-11 w-full items-center justify-between text-left text-base font-semibold text-fg"
      :aria-expanded="moreOpen"
      @click="moreOpen = !moreOpen"
    >
      More nutrients
      <Icon
        name="chevron-down"
        :size="20"
        class="text-fg-muted transition"
        :class="moreOpen && 'rotate-180'"
      />
    </button>
    <div v-if="moreOpen" class="grid grid-cols-2 gap-3">
      <NumberField
        v-for="key in MORE_NUTRIENTS"
        :key="key"
        v-model="form.nutrients[key]"
        :label="NUTRIENTS[key].label"
        :unit="NUTRIENTS[key].unitLabel"
        :min="0"
        :step="stepFor(key)"
        placeholder="0"
        :error="fieldErrors[`nutrients.${key}`]?.[0] ?? null"
      />
    </div>

    <button
      type="button"
      class="flex min-h-11 w-full items-center justify-between text-left text-base font-semibold text-fg"
      :aria-expanded="groupsOpen"
      @click="groupsOpen = !groupsOpen"
    >
      Food-group serves
      <Icon
        name="chevron-down"
        :size="20"
        class="text-fg-muted transition"
        :class="groupsOpen && 'rotate-180'"
      />
    </button>
    <div v-if="groupsOpen" class="space-y-3">
      <p class="text-sm text-fg-muted">
        How many serves of each group the amount above counts as. Leave blank for none.
      </p>
      <div class="grid grid-cols-2 gap-3">
        <NumberField
          v-for="key in FOOD_GROUP_KEYS"
          :key="key"
          v-model="form.foodGroups[key]"
          :label="FOOD_GROUPS[key].label"
          unit="serves"
          :min="0"
          :step="0.5"
          placeholder="0"
          :helper="FOOD_GROUPS[key].serveDefinition"
          :error="fieldErrors[`foodGroups.${key}`]?.[0] ?? null"
        />
      </div>
    </div>
  </div>
</template>
