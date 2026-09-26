<script setup lang="ts">
import {
  addDays,
  targetValue,
  type LogEntry,
  type NutrientKey,
  type NutrientVector,
} from '@diet-tracker/shared'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AppShell from '@/components/ui/AppShell.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import ProgressBar, { type BarColor } from '@/components/ui/ProgressBar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useSession } from '@/features/auth/useSession'
import DayLog from '@/features/log/DayLog.vue'
import EntrySheet from '@/features/log/EntrySheet.vue'
import { useDayLog } from '@/features/log/useLog'
import { useLocalDay } from '@/features/log/useLocalDay'
import InstallHint from '@/features/pwa/InstallHint.vue'
import { useTargets } from '@/features/targets/useTargets'
import { formatDay, formatNumber } from '@/lib/format'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const session = useSession()
const targets = useTargets()
const { today } = useLocalDay()

// The day being viewed follows "today" until the person steps back.
const viewedDay = ref(today.value)
watch(today, (next, previous) => {
  if (viewedDay.value === previous) viewedDay.value = next
})
const log = useDayLog(viewedDay)

const isToday = computed(() => viewedDay.value === today.value)
const dayLabel = computed(() => {
  if (isToday.value) return 'Today'
  if (viewedDay.value === addDays(today.value, -1)) return 'Yesterday'
  return formatDay(viewedDay.value)
})

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
})

interface Bar {
  key: NutrientKey
  label: string
  color: BarColor
  unit: string
}
const BARS: Bar[] = [
  { key: 'protein_g', label: 'Protein', color: 'protein', unit: 'g' },
  { key: 'carbs_g', label: 'Carbs', color: 'carbs', unit: 'g' },
  { key: 'fat_g', label: 'Fat', color: 'fat', unit: 'g' },
  { key: 'fiber_g', label: 'Fibre', color: 'fibre', unit: 'g' },
]

const totals = computed<NutrientVector | null>(() => log.summary.value?.totals ?? null)
const target = (key: NutrientKey) =>
  targets.version.value ? targetValue(targets.version.value.effective, key) : 0
const eaten = (key: NutrientKey) => totals.value?.[key] ?? 0
const remaining = computed(() => Math.round(target('energy_kcal') - eaten('energy_kcal')))

const editing = ref<LogEntry | null>(null)
const entrySheetOpen = computed({
  get: () => editing.value !== null,
  set: (open: boolean) => {
    if (!open) editing.value = null
  },
})

const loading = computed(
  () => session.isLoading.value || targets.isLoading.value || log.isLoading.value,
)
const failed = computed(() => session.isError.value || targets.isError.value || log.isError.value)
const errorMessage = computed(
  () =>
    session.error.value?.message ??
    targets.error.value?.message ??
    log.error.value?.message ??
    'Something went wrong.',
)
function retry(): void {
  void targets.refetch()
  void log.refetch()
}
</script>

<template>
  <AppShell title="Today">
    <template #header-right>
      <div class="flex items-center">
        <IconButton
          label="Previous day"
          icon="chevron-left"
          @click="viewedDay = addDays(viewedDay, -1)"
        />
        <button
          type="button"
          class="min-w-[5.5rem] text-center text-sm font-semibold text-fg"
          :disabled="isToday"
          @click="viewedDay = today"
        >
          {{ dayLabel }}
        </button>
        <IconButton
          label="Next day"
          icon="chevron-right"
          :disabled="isToday"
          @click="viewedDay = addDays(viewedDay, 1)"
        />
      </div>
    </template>

    <div v-if="loading" class="space-y-4" aria-busy="true">
      <Skeleton class="h-7 w-48" />
      <Skeleton class="h-52 w-full" rounded="card" />
      <Skeleton class="h-24 w-full" rounded="card" />
    </div>

    <Card v-else-if="failed">
      <h2 class="text-base font-semibold">Couldn't load your day</h2>
      <p class="mt-1 text-sm text-fg-muted">{{ errorMessage }}</p>
      <Button class="mt-4" variant="secondary" @click="retry">Try again</Button>
    </Card>

    <div v-else class="space-y-4">
      <p v-if="isToday" class="text-[28px] leading-tight font-bold">{{ greeting }}</p>
      <p v-else class="text-[28px] leading-tight font-bold">{{ formatDay(viewedDay) }}</p>
      <InstallHint v-if="isToday" />

      <Card v-if="targets.version.value">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium tracking-wide text-fg-muted uppercase">
            {{ remaining >= 0 ? 'Remaining' : 'Over by' }}
          </span>
          <RouterLink
            :to="{ name: 'targets' }"
            class="flex items-center gap-1 text-sm font-semibold text-accent"
          >
            Targets <Icon name="chevron-right" :size="16" />
          </RouterLink>
        </div>
        <div class="mt-1 flex items-baseline gap-2">
          <span class="text-hero font-bold text-fg">{{
            formatNumber(Math.abs(remaining), 0)
          }}</span>
          <span class="text-base text-fg-muted">kcal</span>
        </div>
        <p class="mt-1 text-sm text-fg-muted">
          {{ formatNumber(Math.round(eaten('energy_kcal')), 0) }} of
          {{ formatNumber(target('energy_kcal'), 0) }} kcal eaten
        </p>
        <ProgressBar
          class="mt-3"
          :value="eaten('energy_kcal')"
          :max="target('energy_kcal')"
          label="Energy"
        />

        <dl class="mt-4 space-y-3">
          <div v-for="bar in BARS" :key="bar.key">
            <div class="flex items-baseline justify-between text-sm">
              <dt class="font-medium text-fg">{{ bar.label }}</dt>
              <dd class="text-fg-muted">
                <span class="font-semibold text-fg">{{ formatNumber(eaten(bar.key), 0) }}</span>
                / {{ formatNumber(target(bar.key), 0) }} {{ bar.unit }}
              </dd>
            </div>
            <ProgressBar
              class="mt-1"
              :value="eaten(bar.key)"
              :max="target(bar.key)"
              :color="bar.color"
              :label="bar.label"
            />
          </div>
        </dl>
      </Card>

      <DayLog
        v-if="log.entries.value.length"
        :entries="log.entries.value"
        @select="editing = $event"
      />

      <Card v-else :padded="false">
        <EmptyState
          icon="sparkles"
          :title="isToday ? 'Nothing logged yet' : 'Nothing logged this day'"
          description="Type what you ate and the estimator does the numbers, or pick from My foods."
        >
          <Button @click="ui.openQuickAdd(isToday ? null : viewedDay)">
            <Icon name="plus" :size="20" /> Log food
          </Button>
        </EmptyState>
      </Card>

      <p v-if="log.entries.value.length" class="px-2 text-center text-xs text-fg-muted">
        Tap an item to change the amount, move it to another meal or day, or remove it.
      </p>
    </div>

    <EntrySheet v-model:open="entrySheetOpen" :entry="editing" :today="today" />
  </AppShell>
</template>
