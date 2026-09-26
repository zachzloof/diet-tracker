<script setup lang="ts">
import { addDays, kgToLb, weightRate, weightTrend, type WeightEntry } from '@diet-tracker/shared'
import { computed, ref } from 'vue'
import AppShell from '@/components/ui/AppShell.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import LineChart from '@/components/ui/LineChart.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import StatTile from '@/components/ui/StatTile.vue'
import { useLocalDay } from '@/features/log/useLocalDay'
import { useProfile } from '@/features/profile/useProfile'
import { ApiError } from '@/lib/api'
import { formatDay, formatDayShort, formatNumber, formatWeight } from '@/lib/format'
import { useUiStore } from '@/stores/ui'
import RecalibrationCard from './RecalibrationCard.vue'
import WeightSheet from './WeightSheet.vue'
import { useDeleteWeight, useRecalibration, useWeights } from './useProgress'

/**
 * Progress: the weight trend (weigh-ins as dots, the seven-day trend as a line, the goal
 * weight as a hairline), the rate of change against the chosen pace, the recalibration
 * check, and the list of weigh-ins.
 */
const ui = useUiStore()
const { today } = useLocalDay()
const profile = useProfile()

const RANGES = [
  { value: '28', label: '4 weeks' },
  { value: '90', label: '3 months' },
  { value: '365', label: '1 year' },
]
const range = ref('90')
const days = computed(() => Number(range.value))

const weights = useWeights(days)
const recalibration = useRecalibration()
const remove = useDeleteWeight()

const units = computed(() => profile.profile.value?.units ?? 'metric')
const display = (kg: number) => (units.value === 'imperial' ? kgToLb(kg) : kg)
const unitLabel = computed(() => (units.value === 'imperial' ? 'lb' : 'kg'))

const entries = computed(() => weights.data.value?.entries ?? [])
const trend = computed(() => weightTrend(entries.value))
const rate = computed(() => weightRate(trend.value))
const latest = computed<WeightEntry | null>(() => entries.value[entries.value.length - 1] ?? null)
const trendNow = computed(() => trend.value[trend.value.length - 1]?.trendKg ?? null)
const trendStart = computed(() => trend.value[0]?.trendKg ?? null)
const change = computed(() =>
  trendNow.value !== null && trendStart.value !== null ? trendNow.value - trendStart.value : null,
)
const expected = computed(() => weights.data.value?.expectedKgPerWeek ?? 0)
const goal = computed(() => weights.data.value?.goalWeightKg ?? null)

/** One slot per calendar day so the x-axis is time; weigh-ins land on their day, the rest is null. */
const chart = computed(() => {
  const end = today.value
  const start = addDays(end, -(days.value - 1))
  const byDay = new Map(entries.value.map((e) => [e.day, e.weightKg]))
  const trendByDay = new Map(trend.value.map((t) => [t.day, t.trendKg]))
  const points: (number | null)[] = []
  const secondary: (number | null)[] = []
  const labels: string[] = []
  for (let day = start; day <= end; day = addDays(day, 1)) {
    const kg = byDay.get(day)
    points.push(kg === undefined ? null : display(kg))
    const t = trendByDay.get(day)
    secondary.push(t === undefined ? null : display(t))
    labels.push(formatDayShort(day))
  }
  return { points, secondary, labels }
})
const labelEvery = computed(() => Math.ceil(days.value / 5))

function signed(kg: number): string {
  const value = display(Math.abs(kg))
  return `${kg > 0 ? '+' : kg < 0 ? '−' : ''}${formatNumber(value, 2)} ${unitLabel.value}`
}
const paceText = computed(() => {
  if (!rate.value) return 'Weigh in over at least a week to see your rate.'
  const plan = expected.value
  const diff = rate.value.kgPerWeek - plan
  const planText = plan === 0 ? 'holding steady' : `${signed(plan)} a week`
  if (Math.abs(diff) <= 0.15) return `On pace. The plan is ${planText}.`
  return `${diff > 0 ? 'Above' : 'Below'} the plan of ${planText}.`
})

const sheetOpen = ref(false)
const editingDay = ref<string | null>(null)
function openSheet(day: string | null = null): void {
  editingDay.value = day
  sheetOpen.value = true
}
function deleteEntry(entry: WeightEntry): void {
  remove.mutate(entry.day, {
    onSuccess: () => ui.toast(`Removed the weigh-in for ${formatDay(entry.day)}.`, 'success'),
    onError: (error: unknown) =>
      ui.toast(error instanceof ApiError ? error.message : 'Could not remove it.', 'error'),
  })
}
const recent = computed(() => [...entries.value].reverse().slice(0, 14))
</script>

<template>
  <AppShell title="Progress" :back="{ name: 'week' }">
    <div class="space-y-4">
      <SegmentedControl v-model="range" label="Range" :options="RANGES" />

      <div v-if="weights.isLoading.value" class="space-y-4" aria-busy="true">
        <div class="grid grid-cols-3 gap-2">
          <Skeleton class="h-20" rounded="card" />
          <Skeleton class="h-20" rounded="card" />
          <Skeleton class="h-20" rounded="card" />
        </div>
        <Skeleton class="h-56 w-full" rounded="card" />
        <Skeleton class="h-40 w-full" rounded="card" />
      </div>

      <Card v-else-if="weights.isError.value && !weights.data.value">
        <h2 class="text-base font-semibold">Couldn't load your weight</h2>
        <p class="mt-1 text-sm text-fg-muted">{{ weights.error.value?.message }}</p>
        <Button class="mt-4" variant="secondary" @click="weights.refetch()">Try again</Button>
      </Card>

      <template v-else>
        <div class="grid grid-cols-3 gap-2">
          <StatTile
            label="Trend"
            :value="trendNow === null ? '–' : formatNumber(display(trendNow), 1)"
            :unit="unitLabel"
            :sub="latest ? `last weigh-in ${formatWeight(latest.weightKg, units)}` : 'no weigh-ins'"
          />
          <StatTile
            label="Change"
            :value="change === null ? '–' : signed(change)"
            :sub="`over ${RANGES.find((r) => r.value === range)?.label ?? ''}`"
          />
          <StatTile
            label="Per week"
            :value="rate ? signed(rate.kgPerWeek) : '–'"
            :sub="expected === 0 ? 'plan: hold steady' : `plan: ${signed(expected)}`"
          />
        </div>

        <Card>
          <div class="flex items-center justify-between gap-2">
            <h2 class="flex items-center gap-2 text-base font-semibold">
              <Icon name="trending-up" :size="20" class="text-accent" />
              Weight trend
            </h2>
            <Button variant="secondary" class="!h-10 !px-3 text-sm" @click="openSheet()">
              <Icon name="plus" :size="18" /> Log
            </Button>
          </div>
          <template v-if="entries.length > 0">
            <LineChart
              class="mt-2"
              :points="chart.points"
              :secondary="chart.secondary"
              :labels="chart.labels"
              :target="goal === null ? null : display(goal)"
              target-label="goal"
              secondary-label="trend"
              :label-every="labelEvery"
              :decimals="1"
              :height="180"
              domain="auto"
              :area="false"
              :unit="unitLabel"
              label="Weigh-ins with the seven-day trend and the goal weight"
            />
            <p class="mt-2 text-sm text-fg-muted">{{ paceText }}</p>
            <ul
              class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted"
              aria-label="Legend"
            >
              <li class="flex items-center gap-1.5">
                <span class="size-2.5 rounded-full bg-accent" aria-hidden="true" /> Weigh-in
              </li>
              <li class="flex items-center gap-1.5">
                <span class="h-0.5 w-4 rounded bg-fg-muted" aria-hidden="true" /> 7-day trend
              </li>
              <li v-if="goal !== null" class="flex items-center gap-1.5">
                <span class="h-px w-4 bg-fg-muted" aria-hidden="true" /> Goal
                {{ formatWeight(goal, units) }}
              </li>
            </ul>
          </template>
          <EmptyState
            v-else
            icon="scale"
            title="No weigh-ins in this range"
            description="Log your weight a few mornings a week. The trend line smooths the daily swings."
          >
            <Button @click="openSheet()"><Icon name="plus" :size="20" /> Log weight</Button>
          </EmptyState>
        </Card>

        <div v-if="recalibration.isLoading.value" aria-busy="true">
          <Skeleton class="h-32 w-full" rounded="card" />
        </div>
        <RecalibrationCard
          v-else-if="recalibration.assessment.value"
          :assessment="recalibration.assessment.value"
        />
        <Card v-else-if="recalibration.isError.value">
          <p class="text-sm text-fg-muted">{{ recalibration.error.value?.message }}</p>
          <Button class="mt-3" variant="secondary" @click="recalibration.refetch()"
            >Try again</Button
          >
        </Card>

        <Card v-if="recent.length > 0" :padded="false" as="section">
          <h2 class="px-4 pt-3 pb-1 text-base font-semibold">Weigh-ins</h2>
          <ul class="divide-y divide-border">
            <li v-for="entry in recent" :key="entry.id" class="flex items-center gap-2 pr-1 pl-4">
              <button
                type="button"
                class="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 text-left"
                :aria-label="`Edit the weigh-in for ${formatDay(entry.day)}`"
                @click="openSheet(entry.day)"
              >
                <span class="min-w-0 flex-1">
                  <span class="block text-base text-fg">{{ formatDay(entry.day) }}</span>
                  <span v-if="entry.note" class="block truncate text-xs text-fg-muted">
                    {{ entry.note }}
                  </span>
                </span>
                <span class="shrink-0 text-base font-semibold text-fg">
                  {{ formatWeight(entry.weightKg, units) }}
                </span>
              </button>
              <IconButton
                label="Remove this weigh-in"
                icon="trash"
                :disabled="remove.isPending.value"
                @click="deleteEntry(entry)"
              />
            </li>
          </ul>
        </Card>
      </template>
    </div>

    <WeightSheet v-model:open="sheetOpen" :today="today" :latest="latest" :day="editingDay" />
  </AppShell>
</template>
