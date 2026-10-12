<script setup lang="ts">
import { EXERCISE_KIND_LABELS, MUSCLE_GROUP_LABELS, type Exercise } from '@diet-tracker/shared'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import AppShell from '@/components/ui/AppShell.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { formatDayShort } from '@/lib/format'
import { useUiStore } from '@/stores/ui'
import { useExercises } from './useTraining'

/** Every exercise you have logged, most recent first; each opens its trend. */
const ui = useUiStore()
const exercises = useExercises()

const used = computed(() => exercises.exercises.value.filter((e) => e.lastUsedAt !== null))

function subtitle(exercise: Exercise): string {
  const groups = exercise.muscleGroups.map((group) => MUSCLE_GROUP_LABELS[group]).join(', ')
  const what = groups
    ? `${EXERCISE_KIND_LABELS[exercise.kind]} · ${groups}`
    : EXERCISE_KIND_LABELS[exercise.kind]
  return exercise.lastUsedAt
    ? `${what} · last ${formatDayShort(exercise.lastUsedAt.slice(0, 10))}`
    : what
}
</script>

<template>
  <AppShell title="Lifts" :back="{ name: 'gym-week' }">
    <Card v-if="exercises.isLoading.value && !ui.online">
      <h2 class="flex items-center gap-2 text-base font-semibold">
        <Icon name="wifi-off" :size="20" class="text-fg-muted" /> You're offline
      </h2>
      <p class="mt-1 text-sm text-fg-muted">Your exercises aren't saved on this phone yet.</p>
      <Button class="mt-4" variant="secondary" @click="exercises.refetch()">Try again</Button>
    </Card>

    <div v-else-if="exercises.isLoading.value" class="space-y-2" aria-busy="true">
      <Skeleton v-for="i in 6" :key="i" class="h-14 w-full" rounded="card" />
    </div>

    <Card v-else-if="exercises.isError.value && !exercises.hasData.value">
      <h2 class="text-base font-semibold">Couldn't load your exercises</h2>
      <p class="mt-1 text-sm text-fg-muted">
        {{ exercises.error.value?.message ?? 'Something went wrong.' }}
      </p>
      <Button class="mt-4" variant="secondary" @click="exercises.refetch()">Try again</Button>
    </Card>

    <Card v-else-if="used.length === 0" :padded="false">
      <EmptyState
        icon="trending-up"
        title="No lifts yet"
        description="Every exercise you log shows here with its best set and how it has moved over time."
      >
        <Button @click="$router.push({ name: 'workout-new' })">
          <Icon name="plus" :size="20" /> Log a workout
        </Button>
      </EmptyState>
    </Card>

    <div v-else class="space-y-3">
      <ul class="divide-y divide-border rounded-card border border-border bg-surface">
        <li v-for="exercise in used" :key="exercise.id">
          <RouterLink
            :to="{ name: 'lift', params: { id: exercise.id } }"
            class="flex min-h-14 items-center justify-between gap-3 px-3 py-2 transition hover:bg-surface-2"
          >
            <span class="min-w-0">
              <span class="block truncate text-base font-medium text-fg">{{ exercise.name }}</span>
              <span class="block truncate text-xs text-fg-muted">{{ subtitle(exercise) }}</span>
            </span>
            <span class="flex shrink-0 items-center gap-2">
              <span
                v-if="exercise.custom"
                class="rounded-full border border-border px-2 py-0.5 text-[11px] text-fg-muted"
                >Yours</span
              >
              <Icon name="chevron-right" :size="20" class="text-fg-muted" />
            </span>
          </RouterLink>
        </li>
      </ul>
      <p class="px-2 text-center text-xs text-fg-muted">
        Most recently used first. Tap one for its best set and trend.
      </p>
    </div>
  </AppShell>
</template>
