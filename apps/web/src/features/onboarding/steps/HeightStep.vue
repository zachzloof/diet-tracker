<script setup lang="ts">
import HeightField from '@/features/profile/HeightField.vue'
import { injectDraft, injectProblem } from '../useOnboardingDraft'

const draft = injectDraft()
const problem = injectProblem()
</script>

<template>
  <HeightField v-model="draft.heightCm" :units="draft.units" :error="problem" />
</template>
