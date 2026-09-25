<script setup lang="ts">
import { GOAL_LABELS, type TargetTrigger } from '@diet-tracker/shared'
import AppShell from '@/components/ui/AppShell.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Chip from '@/components/ui/Chip.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useProfile } from '@/features/profile/useProfile'
import { formatDay, formatNumber, formatWeight } from '@/lib/format'
import { useTargetsHistory } from './useTargets'

const history = useTargetsHistory()
const profile = useProfile()

const TRIGGER_LABELS: Record<TargetTrigger, string> = {
  onboarding: 'Onboarding',
  profile_change: 'Profile change',
  recalibration: 'Recalibration',
}
</script>

<template>
  <AppShell title="Target history" :back="{ name: 'targets' }">
    <div v-if="history.isLoading.value" class="space-y-3" aria-busy="true">
      <Skeleton class="h-24 w-full" rounded="card" />
      <Skeleton class="h-24 w-full" rounded="card" />
    </div>

    <Card v-else-if="history.isError.value">
      <h2 class="text-base font-semibold">Couldn't load history</h2>
      <p class="mt-1 text-sm text-fg-muted">
        {{ history.error.value?.message ?? 'Something went wrong.' }}
      </p>
      <Button class="mt-4" variant="secondary" @click="history.refetch()">Try again</Button>
    </Card>

    <Card v-else-if="history.versions.value.length === 0" :padded="false">
      <EmptyState
        icon="clock"
        title="No targets yet"
        description="Finish onboarding and your first set of targets will appear here."
      />
    </Card>

    <ol v-else class="space-y-3">
      <li v-for="(item, i) in history.versions.value" :key="item.id">
        <Card>
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-base font-semibold text-fg">{{ formatDay(item.effectiveFrom) }}</p>
              <p class="text-sm text-fg-muted">
                {{ TRIGGER_LABELS[item.trigger] }} ·
                {{ formatWeight(item.weightKg, profile.profile.value?.units ?? 'metric') }} ·
                {{ GOAL_LABELS[item.goal].label }}
              </p>
            </div>
            <Chip v-if="i === 0" tone="accent">Current</Chip>
          </div>
          <dl class="mt-3 grid grid-cols-4 gap-2 text-center">
            <div>
              <dt class="text-xs text-fg-muted">kcal</dt>
              <dd class="text-base font-semibold">{{ formatNumber(item.energyKcal) }}</dd>
            </div>
            <div>
              <dt class="text-xs text-fg-muted">Protein</dt>
              <dd class="text-base font-semibold text-protein">
                {{ formatNumber(item.proteinG) }} g
              </dd>
            </div>
            <div>
              <dt class="text-xs text-fg-muted">Carbs</dt>
              <dd class="text-base font-semibold text-carbs">{{ formatNumber(item.carbsG) }} g</dd>
            </div>
            <div>
              <dt class="text-xs text-fg-muted">Fat</dt>
              <dd class="text-base font-semibold text-fat">{{ formatNumber(item.fatG) }} g</dd>
            </div>
          </dl>
          <p v-if="item.overrideCount > 0" class="mt-2 text-xs text-fg-muted">
            {{ item.overrideCount }} target{{ item.overrideCount === 1 ? '' : 's' }} set by you
          </p>
        </Card>
      </li>
    </ol>
  </AppShell>
</template>
