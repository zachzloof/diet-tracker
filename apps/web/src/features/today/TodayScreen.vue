<script setup lang="ts">
import { addDays, isValidDay, isWaterEntry, type LogEntry } from '@diet-tracker/shared'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from '@/components/ui/AppShell.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useSession } from '@/features/auth/useSession'
import DayLog from '@/features/log/DayLog.vue'
import EntrySheet from '@/features/log/EntrySheet.vue'
import { useDayLog } from '@/features/log/useLog'
import { useLocalDay } from '@/features/log/useLocalDay'
import InstallHint from '@/features/pwa/InstallHint.vue'
import { useTargets } from '@/features/targets/useTargets'
import { formatDay } from '@/lib/format'
import { useUiStore } from '@/stores/ui'
import DayStatus from './DayStatus.vue'
import EnergyCard from './EnergyCard.vue'
import FoodGroupsCard from './FoodGroupsCard.vue'
import MicronutrientGrid from './MicronutrientGrid.vue'
import WaterCard from './WaterCard.vue'
import { useDayScore } from './useDayScore'

const ui = useUiStore()
const session = useSession()
const targets = useTargets()
const route = useRoute()
const { today } = useLocalDay()

/** `/day/:day` opens a specific day (from the week strip or the calendar); `/` is today. */
function routeDay(): string | null {
  const param = route.params.day
  return typeof param === 'string' && isValidDay(param) ? param : null
}

// The day being viewed follows "today" until the person steps back or opens a past day.
const viewedDay = ref(routeDay() ?? today.value)
watch(today, (next, previous) => {
  if (viewedDay.value === previous) viewedDay.value = next
})
watch(
  () => route.params.day,
  () => {
    const day = routeDay()
    if (day) viewedDay.value = day
    else if (route.name === 'today') viewedDay.value = today.value
  },
)
const log = useDayLog(viewedDay)
const score = useDayScore(log.summary, targets.version)

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

const foodEntries = computed(() => log.entries.value.filter((e) => !isWaterEntry(e)))

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
      <Skeleton class="h-56 w-full" rounded="card" />
      <Skeleton class="h-32 w-full" rounded="card" />
      <Skeleton class="h-40 w-full" rounded="card" />
    </div>

    <Card v-else-if="failed">
      <h2 class="text-base font-semibold">Couldn't load your day</h2>
      <p class="mt-1 text-sm text-fg-muted">{{ errorMessage }}</p>
      <Button class="mt-4" variant="secondary" @click="retry">Try again</Button>
    </Card>

    <div v-else class="space-y-4">
      <div>
        <p class="text-[28px] leading-tight font-bold">
          {{ isToday ? greeting : formatDay(viewedDay) }}
        </p>
        <DayStatus v-if="score" class="mt-2" :score="score" :is-today="isToday" />
      </div>
      <InstallHint v-if="isToday" />

      <template v-if="score">
        <EnergyCard :score="score" />
        <WaterCard :score="score" :entries="log.entries.value" :day="viewedDay" />
      </template>

      <DayLog v-if="foodEntries.length" :entries="foodEntries" @select="editing = $event" />

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

      <p v-if="foodEntries.length" class="px-2 text-center text-xs text-fg-muted">
        Tap an item to change the amount, move it to another meal or day, or remove it.
      </p>

      <template v-if="score">
        <FoodGroupsCard :score="score" />
        <MicronutrientGrid :score="score" />
      </template>
    </div>

    <EntrySheet v-model:open="entrySheetOpen" :entry="editing" :today="today" />
  </AppShell>
</template>
