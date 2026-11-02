<script setup lang="ts">
import type { WorkoutCard, WorkoutInput, WorkoutSet } from '@diet-tracker/shared'
import { v7 as uuidv7 } from 'uuid'
import { useRouter } from 'vue-router'
import { useLocalDay } from '@/features/log/useLocalDay'
import { setLabel } from '@/features/training/draft'
import { formatDayShort } from '@/lib/format'
import { useWorkoutDraftStore } from '@/stores/workout-draft'
import CardFrame from './CardFrame.vue'

/**
 * A planned session: the exercises with their planned sets and what the person did last
 * time beside each. Start opens the session screen with the plan filled in, through the
 * draft store exactly as "repeat a recent one" does; nothing touches the server until the
 * session saves itself.
 */
const props = defineProps<{ card: WorkoutCard; pending?: boolean }>()
const emit = defineEmits<{ confirmed: []; dismiss: [] }>()

const router = useRouter()
const drafts = useWorkoutDraftStore()
const { today } = useLocalDay()

function toSet(set: WorkoutCard['exercises'][number]['sets'][number]): WorkoutSet {
  return { id: uuidv7(), ...set, rpe: null, completed: false }
}

function label(
  set: WorkoutCard['exercises'][number]['sets'][number],
  measures: readonly WorkoutCard['exercises'][number]['measures'][number][],
): string {
  return setLabel({ id: '', ...set, rpe: null, completed: false }, measures) || '—'
}

function start(): void {
  const input: WorkoutInput = {
    // A plan drafted on an earlier day starts today; sessions are logged on the day.
    day: props.card.day > today.value ? today.value : props.card.day,
    startedAt: new Date().toISOString(),
    endedAt: null,
    title: props.card.title,
    notes: props.card.notes,
    feel: null,
    exercises: props.card.exercises.map((block) => ({
      id: uuidv7(),
      exerciseId: block.exerciseId,
      exerciseName: block.exerciseName,
      notes: '',
      sets: block.sets.map(toSet),
    })),
  }
  const id = uuidv7()
  drafts.start(id, input)
  emit('confirmed')
  void router.push({ name: 'workout', params: { id } })
}
</script>

<template>
  <CardFrame
    icon="dumbbell"
    :title="card.title"
    :state="card.state"
    confirm-label="Start"
    confirmed-label="Started"
    offline-ok
    :pending="pending"
    @confirm="start"
    @dismiss="emit('dismiss')"
  >
    <ul class="space-y-3">
      <li v-for="(block, i) in card.exercises" :key="i">
        <p class="text-base font-medium text-fg">{{ block.exerciseName }}</p>
        <p v-if="!block.exerciseId" class="text-xs text-fg-muted">
          Not in your exercise list; its history will not link.
        </p>
        <ol class="mt-1 space-y-0.5 text-sm tabular-nums" aria-label="Planned sets">
          <li
            v-for="(set, j) in block.sets"
            :key="j"
            class="grid grid-cols-[1.5rem_1fr_1fr] items-baseline gap-2"
          >
            <span class="text-fg-muted">{{ j + 1 }}</span>
            <span class="text-fg">{{ label(set, block.measures) }}</span>
            <span class="truncate text-right text-fg-muted">
              <template v-if="block.last?.sets[j]">{{
                label(block.last.sets[j]!, block.measures)
              }}</template>
              <template v-else-if="j === 0 && !block.last">first time</template>
            </span>
          </li>
        </ol>
        <p v-if="block.last" class="mt-0.5 text-right text-xs text-fg-muted">
          last time, {{ formatDayShort(block.last.day) }}
        </p>
      </li>
    </ul>
    <p v-if="card.notes" class="mt-3 text-sm text-fg-muted">{{ card.notes }}</p>
  </CardFrame>
</template>
