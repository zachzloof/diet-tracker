<script setup lang="ts">
import { ACTIVITY_LABELS, ACTIVITY_LEVELS, activitySchema } from '@diet-tracker/shared'
import { computed } from 'vue'
import OptionList from '@/components/ui/OptionList.vue'
import { injectDraft } from '../useOnboardingDraft'

const draft = injectDraft()

const activity = computed({
  get: () => draft.activity,
  set: (value: string | null) => {
    const parsed = activitySchema.safeParse(value)
    draft.activity = parsed.success ? parsed.data : null
  },
})

const OPTIONS = ACTIVITY_LEVELS.map((value) => ({ value, ...ACTIVITY_LABELS[value] }))
</script>

<template>
  <OptionList v-model="activity" label="Activity level" :options="OPTIONS" />
</template>
