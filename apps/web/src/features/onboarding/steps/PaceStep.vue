<script setup lang="ts">
import { PACES_BY_GOAL, PACE_LABELS, paceSchema } from '@diet-tracker/shared'
import { computed } from 'vue'
import OptionList from '@/components/ui/OptionList.vue'
import WeightField from '@/features/profile/WeightField.vue'
import { injectDraft, injectProblem } from '../useOnboardingDraft'

const draft = injectDraft()
const problem = injectProblem()

const pace = computed({
  get: () => draft.pace,
  set: (value: string | null) => {
    const parsed = paceSchema.safeParse(value)
    draft.pace = parsed.success ? parsed.data : null
  },
})

const OPTIONS = computed(() =>
  (draft.goal ? PACES_BY_GOAL[draft.goal] : []).map((value) => ({
    value,
    ...PACE_LABELS[value],
  })),
)
</script>

<template>
  <div class="space-y-6">
    <OptionList v-model="pace" label="Pace" :options="OPTIONS" />
    <WeightField
      v-model="draft.goalWeightKg"
      :units="draft.units"
      label="Goal weight (optional)"
      helper="Gives the plan a finish line. Leave it blank if you just want the direction."
      :error="problem"
    />
  </div>
</template>
