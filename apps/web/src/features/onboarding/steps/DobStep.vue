<script setup lang="ts">
import Input from '@/components/ui/Input.vue'
import { injectDraft, injectProblem } from '../useOnboardingDraft'

const draft = injectDraft()
const problem = injectProblem()
</script>

<template>
  <Input
    v-model="draft.dob"
    label="Date of birth"
    type="date"
    name="bday"
    autocomplete="bday"
    helper="You need to be 18 or over."
    :error="problem"
  />
</template>
