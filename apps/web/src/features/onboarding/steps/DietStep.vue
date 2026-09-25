<script setup lang="ts">
import { DIET_PATTERNS, DIET_PATTERN_LABELS, dietPatternSchema } from '@diet-tracker/shared'
import { computed } from 'vue'
import OptionList from '@/components/ui/OptionList.vue'
import { injectDraft } from '../useOnboardingDraft'

const draft = injectDraft()

const dietPattern = computed({
  get: () => draft.dietPattern,
  set: (value: string | null) => {
    const parsed = dietPatternSchema.safeParse(value)
    draft.dietPattern = parsed.success ? parsed.data : null
  },
})

const OPTIONS = DIET_PATTERNS.map((value) => ({ value, ...DIET_PATTERN_LABELS[value] }))
</script>

<template>
  <OptionList v-model="dietPattern" label="Diet pattern" :options="OPTIONS" />
</template>
