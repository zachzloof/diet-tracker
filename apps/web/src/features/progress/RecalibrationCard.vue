<script setup lang="ts">
import {
  RECALIBRATION,
  type MacroPreview,
  type RecalibrationAssessment,
} from '@diet-tracker/shared'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Chip, { type ChipTone } from '@/components/ui/Chip.vue'
import Icon, { type IconName } from '@/components/ui/Icon.vue'
import { ApiError } from '@/lib/api'
import { formatDay, formatNumber } from '@/lib/format'
import { useUiStore } from '@/stores/ui'
import { useApplyRecalibration, useSnoozeRecalibration } from './useProgress'

/**
 * The recalibration check (targets.md section 10): every two weeks the app compares the
 * weight trend with the plan and, when they disagree, proposes a bounded energy change the
 * person confirms. `compact` is the Today version, shown only when there is a proposal.
 */
const props = withDefaults(
  defineProps<{ assessment: RecalibrationAssessment; compact?: boolean }>(),
  { compact: false },
)

const ui = useUiStore()
const apply = useApplyRecalibration()
const snooze = useSnoozeRecalibration()

const STATUS: Record<
  RecalibrationAssessment['status'],
  { title: string; icon: IconName; tone: ChipTone; chip: string }
> = {
  proposal: {
    title: 'Time to adjust your targets?',
    icon: 'refresh',
    tone: 'accent',
    chip: 'Proposal',
  },
  on_track: { title: 'Your plan is on track', icon: 'check', tone: 'met', chip: 'On track' },
  not_enough_data: {
    title: 'Keep logging and weighing in',
    icon: 'clock',
    tone: 'neutral',
    chip: 'Needs data',
  },
  not_due: { title: 'Next check', icon: 'calendar', tone: 'neutral', chip: 'Scheduled' },
  unavailable: { title: 'No automatic changes', icon: 'info', tone: 'short', chip: 'Off' },
}
const status = computed(() => STATUS[props.assessment.status])
const proposal = computed(() => props.assessment.proposal)
const evidence = computed(() => props.assessment.evidence)

const ROWS: { key: keyof MacroPreview; label: string; unit: string; color: string }[] = [
  { key: 'energyKcal', label: 'Energy', unit: 'kcal', color: 'text-fg' },
  { key: 'proteinG', label: 'Protein', unit: 'g', color: 'text-protein' },
  { key: 'carbsG', label: 'Carbs', unit: 'g', color: 'text-carbs' },
  { key: 'fatG', label: 'Fat', unit: 'g', color: 'text-fat' },
]

function signed(kg: number): string {
  return `${kg > 0 ? '+' : kg < 0 ? '−' : ''}${Math.abs(kg).toFixed(2)} kg`
}

function applyProposal(): void {
  const energy = proposal.value?.proposed.energyKcal
  if (!energy) return
  apply.mutate(energy, {
    onSuccess: () => ui.toast('Targets updated. The new numbers apply from today.', 'success'),
    onError: (error: unknown) =>
      ui.toast(error instanceof ApiError ? error.message : 'Could not apply the change.', 'error'),
  })
}

function notNow(): void {
  snooze.mutate(undefined, {
    onSuccess: (until) => ui.toast(`Okay. The next check is on ${formatDay(until)}.`, 'info'),
    onError: (error: unknown) =>
      ui.toast(error instanceof ApiError ? error.message : 'Could not snooze.', 'error'),
  })
}
</script>

<template>
  <Card>
    <div class="flex items-start justify-between gap-3">
      <h2 class="flex items-center gap-2 text-base font-semibold">
        <Icon :name="status.icon" :size="20" class="shrink-0 text-accent" />
        {{ status.title }}
      </h2>
      <Chip :tone="status.tone">{{ status.chip }}</Chip>
    </div>

    <p class="mt-2 text-sm text-fg-muted">{{ assessment.reason }}</p>

    <template v-if="proposal">
      <dl class="mt-3 grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 gap-y-1.5 text-sm">
        <template v-for="row in ROWS" :key="row.key">
          <dt class="font-medium text-fg">{{ row.label }}</dt>
          <dd class="text-right text-fg-muted">{{ formatNumber(proposal.current[row.key]) }}</dd>
          <dd class="text-center text-fg-muted" aria-label="becomes">
            <Icon name="chevron-right" :size="14" class="inline" />
          </dd>
          <dd class="text-right font-semibold" :class="row.color">
            {{ formatNumber(proposal.proposed[row.key]) }} {{ row.unit }}
          </dd>
        </template>
      </dl>
      <p v-for="note in proposal.notes" :key="note" class="mt-2 text-xs text-fg-muted">
        {{ note }}
      </p>
      <p class="mt-2 text-xs text-fg-muted">
        Computed from {{ formatNumber(proposal.weightKg, 1) }} kg, your latest weigh-in. Every other
        target follows the new energy. You can change any of them on Targets.
      </p>
      <div class="mt-4 flex gap-2">
        <Button
          class="flex-1"
          :loading="apply.isPending.value"
          :disabled="snooze.isPending.value || !ui.online"
          @click="applyProposal"
        >
          Apply new targets
        </Button>
        <Button
          variant="secondary"
          :loading="snooze.isPending.value"
          :disabled="apply.isPending.value || !ui.online"
          @click="notNow"
        >
          Not now
        </Button>
      </div>
    </template>

    <template v-else-if="!compact">
      <dl
        v-if="assessment.status === 'not_enough_data' || assessment.status === 'on_track'"
        class="mt-3 grid grid-cols-3 gap-2 text-center"
      >
        <div class="rounded-control bg-surface-2 p-2">
          <dt class="text-xs text-fg-muted">Days logged</dt>
          <dd class="text-base font-semibold">
            {{ evidence.daysLogged
            }}<span class="text-xs text-fg-muted"> / {{ RECALIBRATION.minLoggedDays }}</span>
          </dd>
        </div>
        <div class="rounded-control bg-surface-2 p-2">
          <dt class="text-xs text-fg-muted">Weigh-ins</dt>
          <dd class="text-base font-semibold">
            {{ evidence.weighIns
            }}<span class="text-xs text-fg-muted"> / {{ RECALIBRATION.minWeighIns }}</span>
          </dd>
        </div>
        <div class="rounded-control bg-surface-2 p-2">
          <dt class="text-xs text-fg-muted">Trend / week</dt>
          <dd class="text-base font-semibold">
            {{ evidence.actualKgPerWeek === null ? '–' : signed(evidence.actualKgPerWeek) }}
          </dd>
        </div>
      </dl>
      <p v-if="assessment.status === 'not_due' && assessment.dueOn" class="mt-3 text-sm text-fg">
        <Icon name="calendar" :size="16" class="mr-1 inline align-text-bottom text-fg-muted" />
        Next check on <span class="font-semibold">{{ formatDay(assessment.dueOn) }}</span>
      </p>
      <p v-if="assessment.status === 'unavailable'" class="mt-3 text-sm">
        <RouterLink :to="{ name: 'targets' }" class="font-semibold text-accent"
          >Open Targets</RouterLink
        >
      </p>
      <p class="mt-3 text-xs text-fg-muted">
        Every {{ RECALIBRATION.intervalDays }} days, with at least
        {{ RECALIBRATION.minLoggedDays }} logged days and {{ RECALIBRATION.minWeighIns }} weigh-ins,
        the app compares your weight trend with the plan. A change is never more than
        {{ RECALIBRATION.maxAdjustmentKcal }} kcal and never below the safe floor.
      </p>
    </template>
  </Card>
</template>
