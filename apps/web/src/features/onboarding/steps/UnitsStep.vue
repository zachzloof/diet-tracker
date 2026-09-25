<script setup lang="ts">
import { UNIT_SYSTEMS, UNIT_SYSTEM_LABELS } from '@diet-tracker/shared'
import { computed } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { injectDraft } from '../useOnboardingDraft'

const draft = injectDraft()

const units = computed({
  get: () => draft.units,
  set: (value: string) => {
    if (value === 'metric' || value === 'imperial') draft.units = value
  },
})

const OPTIONS = UNIT_SYSTEMS.map((value) => ({ value, label: UNIT_SYSTEM_LABELS[value] }))
</script>

<template>
  <div class="space-y-6">
    <ul class="space-y-3 text-base text-fg-muted">
      <li class="flex gap-3">
        <Icon name="target" :size="22" class="mt-0.5 shrink-0 text-accent" />
        <span
          >Daily targets for energy, protein, carbs, fat, fibre, water and the key vitamins and
          minerals, worked out from your body, goal and training.</span
        >
      </li>
      <li class="flex gap-3">
        <Icon name="edit" :size="22" class="mt-0.5 shrink-0 text-accent" />
        <span>Every number shows its reasoning, and you can override any of them.</span>
      </li>
    </ul>
    <div class="space-y-1.5">
      <span class="block text-sm font-medium text-fg-muted">Units</span>
      <SegmentedControl v-model="units" label="Units" :options="OPTIONS" />
    </div>
    <p class="rounded-card border border-border bg-surface p-4 text-sm text-fg-muted">
      This app is not medical advice. Targets are general guidance for healthy adults. If you have a
      medical condition, talk to a doctor or dietitian before changing what you eat.
    </p>
  </div>
</template>
