<script setup lang="ts">
import { BODY_FAT_PCT } from '@diet-tracker/shared'
import NumberField from '@/components/ui/NumberField.vue'
import { injectDraft, injectProblem } from '../useOnboardingDraft'

const draft = injectDraft()
const problem = injectProblem()
</script>

<template>
  <NumberField
    v-model="draft.bodyFatPct"
    label="Body fat"
    unit="%"
    :min="BODY_FAT_PCT.min"
    :max="BODY_FAT_PCT.max"
    :step="0.5"
    placeholder="Leave blank if unsure"
    helper="From a scan, calipers or a smart scale. Guesses are worse than leaving it blank."
    :error="problem"
  />
</template>
