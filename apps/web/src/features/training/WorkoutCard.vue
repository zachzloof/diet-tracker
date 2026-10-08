<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useUiStore } from '@/stores/ui'
import { useWorkoutDraftStore } from '@/stores/workout-draft'
import { sessionLine, workoutTitle } from './draft'
import { useWorkouts } from './useTraining'

/**
 * The day's training beside its food: each session with its duration, sets and volume, or
 * a rest day with a way to start. Sessions still on this phone only (offline) show too.
 */
const props = defineProps<{ day: string; isToday: boolean }>()

const ui = useUiStore()
const drafts = useWorkoutDraftStore()
const workouts = useWorkouts(
  () => props.day,
  () => props.day,
)

const sessions = computed(() => {
  const saved = workouts.workouts.value
  const local = drafts.pending
    .filter((draft) => draft.input.day === props.day && !saved.some((w) => w.id === draft.id))
    .map((draft) => ({ id: draft.id, ...draft.input, local: true }))
  return [...local, ...saved.map((workout) => ({ ...workout, local: false }))]
})
</script>

<template>
  <Card as="section" aria-labelledby="training-heading">
    <div class="flex items-center justify-between gap-2">
      <h2 id="training-heading" class="flex items-center gap-2 text-base font-semibold">
        <Icon name="dumbbell" :size="20" class="text-accent" />
        Training
      </h2>
      <span v-if="sessions.length" class="text-xs text-fg-muted">
        {{ sessions.length === 1 ? '1 session' : `${sessions.length} sessions` }}
      </span>
    </div>

    <div
      v-if="workouts.isLoading.value && !sessions.length"
      class="mt-3 space-y-2"
      aria-busy="true"
    >
      <Skeleton class="h-14 w-full" />
    </div>

    <ul v-else-if="sessions.length" class="mt-3 divide-y divide-border">
      <li v-for="session in sessions" :key="session.id">
        <RouterLink
          :to="{ name: 'workout', params: { id: session.id } }"
          class="flex min-h-14 items-center justify-between gap-3 py-2"
        >
          <span class="min-w-0">
            <span class="block truncate text-base font-medium text-fg">
              {{ workoutTitle(session.title) }}
            </span>
            <span class="block truncate text-sm text-fg-muted">
              {{ session.endedAt ? sessionLine(session) : 'In progress' }}
              <template v-if="session.local"> · on this phone</template>
            </span>
          </span>
          <Icon name="chevron-right" :size="20" class="shrink-0 text-fg-muted" />
        </RouterLink>
      </li>
    </ul>

    <p v-else class="mt-2 text-sm text-fg-muted">
      {{
        workouts.isError.value && !workouts.hasData.value
          ? (workouts.error.value?.message ?? 'Could not load your sessions.')
          : isToday
            ? 'Rest day so far.'
            : 'No session logged.'
      }}
    </p>

    <Button
      class="mt-3"
      :variant="sessions.length ? 'secondary' : 'primary'"
      block
      @click="$router.push({ name: 'workout-new', query: isToday ? {} : { day } })"
    >
      <Icon name="plus" :size="20" /> Log a workout
    </Button>
    <p v-if="!ui.online" class="mt-2 text-xs text-fg-muted">
      Offline: a session you log now stays on this phone until you are back online.
    </p>
  </Card>
</template>
