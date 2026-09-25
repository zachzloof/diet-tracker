<script setup lang="ts">
import {
  ACTIVITY_LABELS,
  DIET_PATTERN_LABELS,
  GOAL_LABELS,
  PACE_LABELS,
  SEX_LABELS,
  TRAINING_TYPE_LABELS,
  detectTimeZone,
} from '@diet-tracker/shared'
import { computed } from 'vue'
import { formatNumber, formatWeight } from '@/lib/format'
import { injectDraft } from '../useOnboardingDraft'

const draft = injectDraft()

const rows = computed(() => {
  const list: { label: string; value: string }[] = []
  list.push({ label: 'Sex', value: draft.sex ? SEX_LABELS[draft.sex] : '' })
  list.push({ label: 'Born', value: draft.dob })
  list.push({
    label: 'Height',
    value: draft.heightCm === null ? '' : `${formatNumber(draft.heightCm)} cm`,
  })
  list.push({
    label: 'Weight',
    value: draft.weightKg === null ? '' : formatWeight(draft.weightKg, draft.units),
  })
  if (draft.bodyFatPct !== null)
    list.push({ label: 'Body fat', value: `${formatNumber(draft.bodyFatPct)}%` })
  list.push({
    label: 'Goal',
    value: draft.goal
      ? `${GOAL_LABELS[draft.goal].label}${draft.pace ? `, ${PACE_LABELS[draft.pace].label.toLowerCase()}` : ''}`
      : '',
  })
  if (draft.goalWeightKg !== null)
    list.push({ label: 'Goal weight', value: formatWeight(draft.goalWeightKg, draft.units) })
  list.push({
    label: 'Activity',
    value: draft.activity ? ACTIVITY_LABELS[draft.activity].label : '',
  })
  list.push({
    label: 'Training',
    value: draft.trainingType
      ? `${TRAINING_TYPE_LABELS[draft.trainingType]}, ${draft.trainingDaysPerWeek} days a week`
      : '',
  })
  list.push({
    label: 'Diet',
    value: draft.dietPattern ? DIET_PATTERN_LABELS[draft.dietPattern].label : '',
  })
  list.push({ label: 'Allergies', value: draft.allergies.join(', ') || 'None' })
  list.push({ label: 'Dislikes', value: draft.dislikes.join(', ') || 'None' })
  list.push({ label: 'Time zone', value: detectTimeZone().replace(/_/g, ' ') })
  return list
})
</script>

<template>
  <dl class="divide-y divide-border rounded-card border border-border bg-surface">
    <div
      v-for="row in rows"
      :key="row.label"
      class="flex items-baseline justify-between gap-4 px-4 py-3"
    >
      <dt class="shrink-0 text-sm text-fg-muted">{{ row.label }}</dt>
      <dd class="text-right text-base font-medium text-fg">{{ row.value }}</dd>
    </div>
  </dl>
</template>
