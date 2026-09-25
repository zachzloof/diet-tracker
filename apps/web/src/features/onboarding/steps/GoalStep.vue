<script setup lang="ts">
import { DEFAULT_PACE, GOALS, GOAL_LABELS, goalSchema } from '@diet-tracker/shared'
import { computed } from 'vue'
import OptionList from '@/components/ui/OptionList.vue'
import { injectDraft } from '../useOnboardingDraft'

const draft = injectDraft()

const goal = computed({
  get: () => draft.goal,
  set: (value: string | null) => {
    const parsed = goalSchema.safeParse(value)
    draft.goal = parsed.success ? parsed.data : null
    draft.pace = parsed.success ? DEFAULT_PACE[parsed.data] : null
  },
})

const OPTIONS = GOALS.map((value) => ({ value, ...GOAL_LABELS[value] }))
</script>

<template>
  <OptionList v-model="goal" label="Goal" :options="OPTIONS" />
</template>
