<script setup lang="ts">
import { TRAINING_TYPES, TRAINING_TYPE_LABELS, trainingTypeSchema } from '@diet-tracker/shared'
import { computed } from 'vue'
import NumberField from '@/components/ui/NumberField.vue'
import Select from '@/components/ui/Select.vue'
import { injectDraft } from '../useOnboardingDraft'

const draft = injectDraft()

const trainingType = computed({
  get: () => draft.trainingType ?? '',
  set: (value: string) => {
    const parsed = trainingTypeSchema.safeParse(value)
    draft.trainingType = parsed.success ? parsed.data : null
    if (parsed.success && parsed.data === 'none') draft.trainingDaysPerWeek = 0
  },
})

const days = computed({
  get: () => draft.trainingDaysPerWeek,
  set: (value: number | null) => {
    draft.trainingDaysPerWeek = Math.max(0, Math.min(7, Math.round(value ?? 0)))
  },
})

const OPTIONS = TRAINING_TYPES.map((value) => ({ value, label: TRAINING_TYPE_LABELS[value] }))
</script>

<template>
  <div class="space-y-5">
    <Select
      v-model="trainingType"
      label="Main type of training"
      placeholder="Choose one"
      :options="OPTIONS"
    />
    <NumberField
      v-model="days"
      label="Sessions a week"
      unit="days"
      :min="0"
      :max="7"
      :step="1"
      :disabled="draft.trainingType === 'none'"
      helper="Count sessions, not hours."
    />
  </div>
</template>
