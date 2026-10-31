<script setup lang="ts">
import { PACES_BY_GOAL, PACE_LABELS, paceSchema } from '@diet-tracker/shared'
import { computed } from 'vue'
import OptionList from '@/components/ui/OptionList.vue'
import Toggle from '@/components/ui/Toggle.vue'
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
    <!-- D40: a gainer's energy target can be a floor. Off by default; the owner's call. -->
    <div v-if="draft.goal === 'gain'" class="rounded-card border border-border bg-surface px-4">
      <Toggle
        v-model="draft.energyUncapped"
        label="Uncapped energy"
        description="Going over the energy target never counts against the day. Handy when some days you can eat a lot more than others."
      />
    </div>
  </div>
</template>
