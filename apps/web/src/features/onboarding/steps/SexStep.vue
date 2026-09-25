<script setup lang="ts">
import { SEXES, SEX_LABELS } from '@diet-tracker/shared'
import { computed } from 'vue'
import OptionList from '@/components/ui/OptionList.vue'
import { injectDraft } from '../useOnboardingDraft'

const draft = injectDraft()

const sex = computed({
  get: () => draft.sex,
  set: (value: string | null) => {
    draft.sex = value === 'male' || value === 'female' || value === 'unspecified' ? value : null
  },
})

const OPTIONS = SEXES.map((value) => ({
  value,
  label: SEX_LABELS[value],
  help:
    value === 'unspecified'
      ? 'Uses the average of the two formulas and the higher nutrient guideline'
      : undefined,
}))
</script>

<template>
  <OptionList v-model="sex" label="Sex" :options="OPTIONS" />
</template>
