<script setup lang="ts">
import { workoutElapsedS, workoutSummary, type WorkoutInput } from '@diet-tracker/shared'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { formatClock, formatDuration, formatVolume } from './draft'

/**
 * The session so far, pinned under the header as the page scrolls: time, sets done and
 * kilograms lifted. While the session is open the clock runs from its start; once it is
 * finished the strip holds the duration every session card shows.
 */
const props = defineProps<{
  workout: Pick<WorkoutInput, 'exercises' | 'startedAt' | 'endedAt'>
}>()

const now = ref(Date.now())
let timer = 0
// A quarter-second tick keeps the seconds even; the text only re-renders when it changes.
watch(
  () => props.workout.endedAt,
  (endedAt) => {
    window.clearInterval(timer)
    if (endedAt !== null) return
    now.value = Date.now()
    timer = window.setInterval(() => (now.value = Date.now()), 250)
  },
  { immediate: true },
)
onScopeDispose(() => window.clearInterval(timer))

const summary = computed(() => workoutSummary(props.workout))
const time = computed(() =>
  summary.value.durationMin === null
    ? formatClock(workoutElapsedS(props.workout, now.value))
    : formatDuration(summary.value.durationMin),
)
</script>

<template>
  <section
    aria-label="This session so far"
    class="sticky z-10 -mx-4 -mt-2 bg-bg/90 px-4 py-2 backdrop-blur"
    :style="{ top: 'calc(3.5rem + env(safe-area-inset-top))' }"
  >
    <div
      class="grid grid-cols-3 rounded-card border border-border bg-surface px-2 py-2.5 text-center shadow-card"
    >
      <div>
        <p class="text-xl font-bold text-fg tabular-nums" role="timer">{{ time }}</p>
        <p class="text-xs text-fg-muted">time</p>
      </div>
      <div>
        <p class="text-xl font-bold text-fg tabular-nums">{{ summary.workingSets }}</p>
        <p class="text-xs text-fg-muted">{{ summary.workingSets === 1 ? 'set' : 'sets' }} done</p>
      </div>
      <div>
        <p class="text-xl font-bold text-fg tabular-nums">{{ formatVolume(summary.volumeKg) }}</p>
        <p class="text-xs text-fg-muted">lifted</p>
      </div>
    </div>
  </section>
</template>
