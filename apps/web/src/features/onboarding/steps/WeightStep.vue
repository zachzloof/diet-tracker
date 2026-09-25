<script setup lang="ts">
import WeightField from '@/features/profile/WeightField.vue'
import { injectDraft, injectProblem } from '../useOnboardingDraft'

const draft = injectDraft()
const problem = injectProblem()
</script>

<template>
  <WeightField v-model="draft.weightKg" :units="draft.units" :error="problem" />
</template>
