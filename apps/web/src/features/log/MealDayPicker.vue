<script setup lang="ts">
import { MEALS, MEAL_LABELS, addDays, mealSchema, type Meal } from '@diet-tracker/shared'
import { computed, ref, watch } from 'vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { formatDay } from '@/lib/format'

/**
 * Which meal and which day an entry belongs to. The meal is inferred from the time and the
 * day defaults to the user's local today; both are one tap to change. Before 04:00 the
 * previous day is offered up front (a late dinner belongs to the day it started).
 */
const meal = defineModel<Meal>('meal', { required: true })
const day = defineModel<string>('day', { required: true })

const props = defineProps<{
  /** The user's local today, so "Today" and "Yesterday" mean the right thing. */
  today: string
  /** Set when it is before the late-night cutoff and yesterday is a likely answer. */
  previousDay?: string | null
}>()

const MEAL_OPTIONS = MEALS.map((value) => ({ value, label: MEAL_LABELS[value] }))

const mealValue = computed({
  get: () => meal.value,
  set: (value: string) => {
    const parsed = mealSchema.safeParse(value)
    if (parsed.success) meal.value = parsed.data
  },
})

const yesterday = computed(() => addDays(props.today, -1))
const isOther = computed(() => day.value !== props.today && day.value !== yesterday.value)
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
    <SegmentedControl v-model="mealValue" label="Meal" :options="MEAL_OPTIONS" />
    <div>
      <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Day">
        <button
          type="button"
          role="radio"
          :aria-checked="day === today && !pickingOther"
          class="h-9 rounded-full border px-3.5 text-sm font-medium transition"
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
          class="h-9 rounded-full border px-3.5 text-sm font-medium transition"
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
          :aria-checked="pickingOther || isOther"
          class="h-9 rounded-full border px-3.5 text-sm font-medium transition"
          :class="
            pickingOther || isOther
              ? 'border-accent bg-accent/15 text-fg'
              : 'border-border bg-surface-2 text-fg-muted'
          "
          @click="pickingOther = true"
        >
          {{ isOther ? formatDay(day) : 'Another day' }}
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
      <p v-if="previousDay && day === today" class="mt-2 text-sm text-fg-muted">
        It's after midnight. Still yesterday's food? Tap Yesterday.
      </p>
    </div>
  </div>
</template>
