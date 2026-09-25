<script setup lang="ts">
import { targetValue } from '@diet-tracker/shared'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import AppShell from '@/components/ui/AppShell.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useSession } from '@/features/auth/useSession'
import InstallHint from '@/features/pwa/InstallHint.vue'
import { useTargets } from '@/features/targets/useTargets'
import { formatNumber } from '@/lib/format'

const session = useSession()
const targets = useTargets()

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
})

const today = new Date().toLocaleDateString(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

const summary = computed(() => {
  const v = targets.version.value
  if (!v) return null
  return {
    energy: targetValue(v.effective, 'energy_kcal'),
    protein: targetValue(v.effective, 'protein_g'),
    carbs: targetValue(v.effective, 'carbs_g'),
    fat: targetValue(v.effective, 'fat_g'),
    fibre: targetValue(v.effective, 'fiber_g'),
    water: targetValue(v.effective, 'water_ml'),
  }
})
</script>

<template>
  <AppShell title="Today">
    <template #header-right>
      <span class="text-sm text-fg-muted">{{ today }}</span>
    </template>

    <div
      v-if="session.isLoading.value || targets.isLoading.value"
      class="space-y-4"
      aria-busy="true"
    >
      <Skeleton class="h-7 w-48" />
      <Skeleton class="h-40 w-full" rounded="card" />
      <Skeleton class="h-24 w-full" rounded="card" />
    </div>

    <Card v-else-if="session.isError.value || targets.isError.value">
      <h2 class="text-base font-semibold">Couldn't load your day</h2>
      <p class="mt-1 text-sm text-fg-muted">
        {{
          session.error.value?.message ?? targets.error.value?.message ?? 'Something went wrong.'
        }}
      </p>
      <Button class="mt-4" variant="secondary" @click="targets.refetch()">Try again</Button>
    </Card>

    <div v-else class="space-y-4">
      <p class="text-[28px] leading-tight font-bold">{{ greeting }}</p>
      <InstallHint />

      <Card v-if="summary">
        <RouterLink :to="{ name: 'targets' }" class="block">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium tracking-wide text-fg-muted uppercase"
              >Today's targets</span
            >
            <span class="flex items-center gap-1 text-sm font-semibold text-accent">
              Why <Icon name="chevron-right" :size="16" />
            </span>
          </div>
          <div class="mt-1 flex items-baseline gap-2">
            <span class="text-hero font-bold text-fg">{{ formatNumber(summary.energy) }}</span>
            <span class="text-base text-fg-muted">kcal</span>
          </div>
          <dl class="mt-3 grid grid-cols-3 gap-2">
            <div class="rounded-control bg-surface-2 px-3 py-2">
              <dt class="text-xs text-fg-muted">Protein</dt>
              <dd class="text-base font-semibold text-protein">
                {{ formatNumber(summary.protein) }} g
              </dd>
            </div>
            <div class="rounded-control bg-surface-2 px-3 py-2">
              <dt class="text-xs text-fg-muted">Carbs</dt>
              <dd class="text-base font-semibold text-carbs">
                {{ formatNumber(summary.carbs) }} g
              </dd>
            </div>
            <div class="rounded-control bg-surface-2 px-3 py-2">
              <dt class="text-xs text-fg-muted">Fat</dt>
              <dd class="text-base font-semibold text-fat">{{ formatNumber(summary.fat) }} g</dd>
            </div>
          </dl>
          <p class="mt-3 text-sm text-fg-muted">
            Fibre {{ formatNumber(summary.fibre) }} g · Water {{ formatNumber(summary.water) }} ml
          </p>
        </RouterLink>
      </Card>

      <Card :padded="false">
        <EmptyState
          icon="sparkles"
          title="Nothing logged yet"
          description="Food logging arrives in the next slice. Your targets are ready and waiting."
        />
      </Card>
    </div>
  </AppShell>
</template>
