<script setup lang="ts">
import {
  MEALS,
  MEAL_LABELS,
  addDays,
  isPlanOnlyDay,
  lastPlanDay,
  mealSchema,
  type Meal,
} from '@diet-tracker/shared'
import { computed, ref, watch } from 'vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { formatDay } from '@/lib/format'

/**
 * Which meal and which day an entry belongs to. The meal is inferred from the time and the
 * day defaults to the user's local today; both are one tap to change. Before 04:00 the
 * previous day is offered up front (a late dinner belongs to the day it started). Planned
 * (D43) sits with the meals: food not eaten yet has no meal of the day, and tomorrow can
 * hold nothing else, so there it is the only option.
 */
const meal = defineModel<Meal>('meal', { required: true })
const day = defineModel<string>('day', { required: true })
const planned = defineModel<boolean>('planned', { default: false })

const props = defineProps<{
  /** The user's local today, so "Today" and "Yesterday" mean the right thing. */
  today: string
  /** Set when it is before the late-night cutoff and yesterday is a likely answer. */
  previousDay?: string | null
}>()

const PLANNED = 'planned'
const PLANNED_OPTION = { value: PLANNED, label: 'Planned' }
const MEAL_OPTIONS = MEALS.map((value) => ({ value, label: MEAL_LABELS[value] }))

const planOnly = computed(() => isPlanOnlyDay(day.value, props.today))
const options = computed(() =>
  planOnly.value ? [PLANNED_OPTION] : [...MEAL_OPTIONS, PLANNED_OPTION],
)

const slotValue = computed({
  get: () => (planned.value ? PLANNED : meal.value),
  set: (value: string) => {
    if (value === PLANNED) {
      planned.value = true
      return
    }
    const parsed = mealSchema.safeParse(value)
    if (parsed.success) {
      meal.value = parsed.data
      planned.value = false
    }
  },
})

// Watches both: a parent resetting `planned` must not leave food eaten on a day to come.
watch(
  [planOnly, planned],
  ([only, isPlanned]) => {
    if (only && !isPlanned) planned.value = true
  },
  { immediate: true },
)

const yesterday = computed(() => addDays(props.today, -1))
const tomorrow = computed(() => lastPlanDay(props.today))
const isOther = computed(
  () => day.value !== props.today && day.value !== yesterday.value && day.value !== tomorrow.value,
)
const pickingOther = ref(false)
watch(isOther, (other) => {
  if (other) pickingOther.value = true
})

function pick(value: string): void {
  pickingOther.value = false
  day.value = value
}
</script>

<template>
  <div class="space-y-3">
    <SegmentedControl v-model="slotValue" label="Meal" :options="options" />
    <div>
      <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Day">
        <button
          type="button"
          role="radio"
          :aria-checked="day === today && !pickingOther"
          class="h-11 rounded-full border px-3 text-sm font-medium transition"
          :class="
            day === today && !pickingOther
              ? 'border-accent bg-accent/15 text-fg'
              : 'border-border bg-surface-2 text-fg-muted'
          "
          @click="pick(today)"
        >
          Today
        </button>
        <button
          type="button"
          role="radio"
          :aria-checked="day === yesterday && !pickingOther"
          class="h-11 rounded-full border px-3 text-sm font-medium transition"
          :class="
            day === yesterday && !pickingOther
              ? 'border-accent bg-accent/15 text-fg'
              : 'border-border bg-surface-2 text-fg-muted'
          "
          @click="pick(yesterday)"
        >
          Yesterday
        </button>
        <button
          type="button"
          role="radio"
          :aria-checked="day === tomorrow && !pickingOther"
          class="h-11 rounded-full border px-3 text-sm font-medium transition"
          :class="
            day === tomorrow && !pickingOther
              ? 'border-accent bg-accent/15 text-fg'
              : 'border-border bg-surface-2 text-fg-muted'
          "
          @click="pick(tomorrow)"
        >
          Tomorrow
        </button>
        <button
          type="button"
          role="radio"
          :aria-checked="pickingOther || isOther"
          class="h-11 rounded-full border px-3 text-sm font-medium transition"
          :class="
            pickingOther || isOther
              ? 'border-accent bg-accent/15 text-fg'
              : 'border-border bg-surface-2 text-fg-muted'
          "
          @click="pickingOther = true"
        >
          {{ isOther ? formatDay(day) : 'Other' }}
        </button>
      </div>
      <input
        v-if="pickingOther"
        v-model="day"
        type="date"
        :max="today"
        aria-label="Day"
        class="mt-2 h-12 w-full rounded-control border border-border bg-surface-2 px-4 text-base text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
      />
      <p v-if="planOnly" class="mt-2 text-sm text-fg-muted">
        Tomorrow can only be planned. It counts once you have eaten it.
      </p>
      <p v-else-if="planned" class="mt-2 text-sm text-fg-muted">
        Planned food counts once you have eaten it.
      </p>
      <p v-else-if="previousDay && day === today" class="mt-2 text-sm text-fg-muted">
        It's after midnight. Still yesterday's food? Tap Yesterday.
      </p>
    </div>
  </div>
</template>
