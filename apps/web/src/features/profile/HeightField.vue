<script setup lang="ts">
import { HEIGHT_CM, cmToFeetInches, feetInchesToCm, type UnitSystem } from '@diet-tracker/shared'
import { computed } from 'vue'
import NumberField from '@/components/ui/NumberField.vue'

/** Height in cm on the wire; shown as cm or as feet and inches. */
const model = defineModel<number | null>({ default: null })

withDefaults(defineProps<{ units: UnitSystem; error?: string | null }>(), { error: null })

const imperial = computed(() => (model.value === null ? null : cmToFeetInches(model.value)))

const feet = computed({
  get: () => imperial.value?.feet ?? null,
  set: (value: number | null) => {
    if (value === null) return
    model.value = Math.round(feetInchesToCm(value, imperial.value?.inches ?? 0) * 10) / 10
  },
})

const inches = computed({
  get: () => imperial.value?.inches ?? null,
  set: (value: number | null) => {
    if (value === null) return
    model.value = Math.round(feetInchesToCm(imperial.value?.feet ?? 5, value) * 10) / 10
  },
})
</script>

<template>
  <NumberField
    v-if="units === 'metric'"
    v-model="model"
    label="Height"
    unit="cm"
    :min="HEIGHT_CM.min"
    :max="HEIGHT_CM.max"
    :step="1"
    placeholder="175"
    :error="error"
  />
  <div v-else class="space-y-1.5">
    <div class="grid grid-cols-2 gap-3">
      <NumberField
        v-model="feet"
        label="Feet"
        unit="ft"
        :min="3"
        :max="8"
        :step="1"
        placeholder="5"
      />
      <NumberField
        v-model="inches"
        label="Inches"
        unit="in"
        :min="0"
        :max="11"
        :step="1"
        placeholder="9"
      />
    </div>
    <p v-if="error" class="text-sm text-over" role="alert">{{ error }}</p>
  </div>
</template>
