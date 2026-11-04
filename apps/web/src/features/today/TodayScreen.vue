<script setup lang="ts">
import {
  addDays,
  energyUncapped,
  isPlanOnlyDay,
  isValidDay,
  isWaterEntry,
  lastPlanDay,
  type LogEntry,
} from '@diet-tracker/shared'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from '@/components/ui/AppShell.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Chip from '@/components/ui/Chip.vue'
import DayStepper from '@/components/ui/DayStepper.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useSession } from '@/features/auth/useSession'
import DayLog from '@/features/log/DayLog.vue'
import EatPlanSheet from '@/features/log/EatPlanSheet.vue'
import EntrySheet from '@/features/log/EntrySheet.vue'
import MealGroupSheet from '@/features/log/MealGroupSheet.vue'
import PlannedList from '@/features/log/PlannedList.vue'
import { groupMembers, type DayLogRow, type GroupRow } from '@/features/log/day-groups'
import { useDayLog } from '@/features/log/useLog'
import BriefCard from '@/features/coach/BriefCard.vue'
import CoachButton from '@/features/coach/CoachButton.vue'
import { useLocalDay } from '@/features/log/useLocalDay'
import RecalibrationCard from '@/features/progress/RecalibrationCard.vue'
import WeightCard from '@/features/progress/WeightCard.vue'
import { useRecalibration } from '@/features/progress/useProgress'
import { usePreferences } from '@/features/profile/usePreferences'
import InstallHint from '@/features/pwa/InstallHint.vue'
import { useTargets } from '@/features/targets/useTargets'
import { formatDay } from '@/lib/format'
import { useQueueStore } from '@/stores/queue'
import { useUiStore } from '@/stores/ui'
import DayStatus from './DayStatus.vue'
import EnergyCard from './EnergyCard.vue'
import FoodGroupsCard from './FoodGroupsCard.vue'
import MicronutrientGrid from './MicronutrientGrid.vue'
import WaterCard from './WaterCard.vue'
import { useDayScore } from './useDayScore'

const ui = useUiStore()
const queue = useQueueStore()
const session = useSession()
const targets = useTargets()
const route = useRoute()
const { today } = useLocalDay()
// Display preferences (D37): cards are hidden, never recomputed, so the score is unchanged.
const prefs = usePreferences()

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
/** Tomorrow (D43): the one day ahead the stepper reaches, which holds a plan and nothing else. */
const planOnly = computed(() => isPlanOnlyDay(viewedDay.value, today.value))
const dayLabel = computed(() => {
  if (isToday.value) return 'Today'
  if (viewedDay.value === addDays(today.value, -1)) return 'Yesterday'
  if (viewedDay.value === addDays(today.value, 1)) return 'Tomorrow'
  return formatDay(viewedDay.value)
})

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
})

// Eaten and planned never mix: everything that adds up reads `foodEntries`.
const foodEntries = computed(() => log.entries.value.filter((e) => !isWaterEntry(e) && !e.planned))
const plannedEntries = computed(() => log.entries.value.filter((e) => e.planned))

// The fortnightly plan check only surfaces here when it has a proposal to confirm.
const recalibration = useRecalibration(
  computed(() => isToday.value && targets.version.value !== null),
)
const proposal = computed(() =>
  recalibration.assessment.value?.status === 'proposal' ? recalibration.assessment.value : null,
)

// A logged meal opens as one sheet listing its ingredients (D33). Tapping an ingredient
// swaps to the ordinary item editor and comes back to the meal afterwards, as long as the
// meal still has ingredients.
const viewedGroup = ref<Pick<GroupRow, 'groupId' | 'name'> | null>(null)
const groupSheetOpen = ref(false)
const groupEntries = computed(() =>
  viewedGroup.value ? groupMembers(log.entries.value, viewedGroup.value.groupId) : [],
)
const returnToGroup = ref(false)

function openGroup(group: GroupRow): void {
  viewedGroup.value = { groupId: group.groupId, name: group.name }
  returnToGroup.value = false
  groupSheetOpen.value = true
}

const editing = ref<LogEntry | null>(null)
const entrySheetOpen = computed({
  get: () => editing.value !== null,
  set: (open: boolean) => {
    if (open) return
    editing.value = null
    if (returnToGroup.value) {
      returnToGroup.value = false
      // Let the editor finish sliding away before the meal sheet rises again.
      window.setTimeout(() => {
        if (groupEntries.value.length > 0) groupSheetOpen.value = true
      }, 260)
    }
  },
})

function editIngredient(entry: LogEntry): void {
  groupSheetOpen.value = false
  returnToGroup.value = true
  editing.value = entry
}

// The tick on a plan asks which meal (D43). Kept here because the list leaves with its last row.
const eating = ref<DayLogRow | null>(null)
const eatSheetOpen = ref(false)

function askMeal(row: DayLogRow): void {
  eating.value = row
  eatSheetOpen.value = true
}

// Cached data always wins over an error: offline, the last known day stays on screen.
const loading = computed(
  () => session.isLoading.value || targets.isLoading.value || log.isLoading.value,
)
const failed = computed(
  () =>
    (session.isError.value && !session.user.value) ||
    (targets.isError.value && !targets.version.value) ||
    (log.isError.value && !log.hasData.value),
)
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
  <AppShell title="Today" :log-day="planOnly ? viewedDay : null">
    <template #header-right>
      <CoachButton />
    </template>
    <DayStepper
      :label="dayLabel"
      :is-current="isToday"
      :at-end="viewedDay >= lastPlanDay(today)"
      @prev="viewedDay = addDays(viewedDay, -1)"
      @next="viewedDay = addDays(viewedDay, 1)"
      @reset="viewedDay = today"
    />

    <Card v-if="loading && !ui.online" class="mt-2">
      <h2 class="flex items-center gap-2 text-base font-semibold">
        <Icon name="wifi-off" :size="20" class="text-fg-muted" /> You're offline
      </h2>
      <p class="mt-1 text-sm text-fg-muted">
        This day isn't saved on this phone yet. Days you have opened before stay available offline,
        and anything you log now is queued until you're back online.
      </p>
      <Button class="mt-4" variant="secondary" @click="retry">Try again</Button>
    </Card>

    <div v-else-if="loading" class="mt-2 space-y-4" aria-busy="true">
      <Skeleton class="h-7 w-48" />
      <Skeleton class="h-56 w-full" rounded="card" />
      <Skeleton class="h-32 w-full" rounded="card" />
      <Skeleton class="h-40 w-full" rounded="card" />
    </div>

    <Card v-else-if="failed" class="mt-2">
      <h2 class="text-base font-semibold">Couldn't load your day</h2>
      <p class="mt-1 text-sm text-fg-muted">{{ errorMessage }}</p>
      <Button class="mt-4" variant="secondary" @click="retry">Try again</Button>
    </Card>

    <div v-else class="mt-2 space-y-4">
      <div>
        <p class="text-[28px] leading-tight font-bold">
          {{ isToday ? greeting : formatDay(viewedDay) }}
        </p>
        <div v-if="planOnly" class="mt-2 flex flex-wrap items-center gap-2">
          <Chip tone="neutral"><Icon name="calendar" :size="16" /> Plan only</Chip>
          <span class="text-xs text-fg-muted">Nothing counts until you have eaten it.</span>
        </div>
        <DayStatus
          v-else-if="score && targets.version.value"
          class="mt-2"
          :score="score"
          :goal="targets.version.value.effective.meta.goalApplied"
          :uncapped="energyUncapped(targets.version.value.effective)"
          :is-today="isToday"
        />
      </div>
      <BriefCard v-if="isToday" half="diet" />
      <InstallHint v-if="isToday" />

      <p
        v-if="queue.pendingMeals > 0"
        class="flex items-center gap-2 rounded-card border border-border bg-surface-2 px-3 py-2 text-sm text-fg-muted"
        role="status"
      >
        <Icon name="clock" :size="18" class="shrink-0" />
        {{ queue.pendingMeals }} {{ queue.pendingMeals === 1 ? 'entry is' : 'entries are' }} waiting
        for a connection. {{ ui.online ? 'Sending…' : 'They send when you are back online.' }}
      </p>

      <RecalibrationCard v-if="proposal" :assessment="proposal" compact />

      <template v-if="score">
        <EnergyCard :score="score" :planned="log.plannedTotals.value" />
        <WaterCard
          v-if="prefs.water && !planOnly"
          :score="score"
          :entries="log.entries.value"
          :day="viewedDay"
          :planned="log.plannedTotals.value?.water_ml"
        />
      </template>

      <WeightCard v-if="isToday" :today="today" />

      <PlannedList
        v-if="plannedEntries.length"
        :entries="plannedEntries"
        :day="viewedDay"
        :today="today"
        @select="editing = $event"
        @select-group="openGroup"
        @eat="askMeal"
      />

      <DayLog
        v-if="foodEntries.length"
        :entries="foodEntries"
        @select="editing = $event"
        @select-group="openGroup"
      />

      <Card v-else-if="planOnly && !plannedEntries.length" :padded="false">
        <EmptyState
          icon="calendar"
          title="Nothing planned yet"
          description="Plan tomorrow's food here. It stays out of your numbers until you have eaten it."
        >
          <Button @click="ui.openQuickAdd(viewedDay)">
            <Icon name="plus" :size="20" /> Plan food
          </Button>
        </EmptyState>
      </Card>

      <Card v-else-if="!plannedEntries.length" :padded="false">
        <EmptyState
          icon="sparkles"
          :title="isToday ? 'Nothing logged yet' : 'Nothing logged this day'"
          description="Type what you ate and the estimator does the numbers, or pick a saved meal or food."
        >
          <Button @click="ui.openQuickAdd(isToday ? null : viewedDay)">
            <Icon name="plus" :size="20" /> Log food
          </Button>
        </EmptyState>
      </Card>

      <p
        v-if="foodEntries.length || plannedEntries.length"
        class="px-2 text-center text-xs text-fg-muted"
      >
        Tap an item to change the amount, move it to another meal or day, or remove it. Tap a meal
        to see its ingredients.
      </p>

      <template v-if="score && prefs.nutrientDetail === 'full' && !planOnly">
        <FoodGroupsCard :score="score" :entries="foodEntries" :is-today="isToday" />
        <MicronutrientGrid :score="score" :entries="foodEntries" :is-today="isToday" />
      </template>
    </div>

    <EatPlanSheet v-model:open="eatSheetOpen" :row="eating" />
    <EntrySheet v-model:open="entrySheetOpen" :entry="editing" :today="today" />
    <MealGroupSheet
      v-model:open="groupSheetOpen"
      :group-id="viewedGroup?.groupId ?? null"
      :name="viewedGroup?.name ?? ''"
      :entries="groupEntries"
      :today="today"
      @select="editIngredient"
    />
  </AppShell>
</template>
