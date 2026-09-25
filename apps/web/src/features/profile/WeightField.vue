<script setup lang="ts">
import { WEIGHT_KG, kgToLb, lbToKg, type UnitSystem } from '@diet-tracker/shared'
import { computed } from 'vue'
import NumberField from '@/components/ui/NumberField.vue'

/** Weight in kg on the wire; shown as kg or lb. */
const model = defineModel<number | null>({ default: null })

withDefaults(
  defineProps<{
    units: UnitSystem
    label?: string
    helper?: string
    error?: string | null
  }>(),
  { label: 'Weight', error: null },
)

const pounds = computed({
  get: () => (model.value === null ? null : Math.round(kgToLb(model.value) * 10) / 10),
  set: (value: number | null) => {
    model.value = value === null ? null : Math.round(lbToKg(value) * 10) / 10
  },
})
</script>

<template>
  <NumberField
    v-if="units === 'metric'"
    v-model="model"
    :label="label"
    unit="kg"
    :min="WEIGHT_KG.min"
    :max="WEIGHT_KG.max"
    :step="0.5"
    placeholder="70"
    :helper="helper"
    :error="error"
  />
  <NumberField
    v-else
    v-model="pounds"
    :label="label"
    unit="lb"
    :min="Math.round(kgToLb(WEIGHT_KG.min))"
    :max="Math.round(kgToLb(WEIGHT_KG.max))"
    :step="0.5"
    placeholder="155"
    :helper="helper"
    :error="error"
  />
</template>
