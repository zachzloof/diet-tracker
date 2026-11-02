<script setup lang="ts">
import type { CoachCard } from '@diet-tracker/shared'
import EstimateCard from './EstimateCard.vue'
import MealCard from './MealCard.vue'
import NoteCard from './NoteCard.vue'
import TargetChangeCard from './TargetChangeCard.vue'
import WorkoutCard from './WorkoutCard.vue'

/**
 * One drafted card by kind (slice 11b). Each confirms through its own endpoint and then
 * reports `confirmed`; `dismiss` records the dismissal; `clarify` (estimate only) sends the
 * answer back to the coach as the next message.
 */
defineProps<{ card: CoachCard; pending?: boolean }>()
defineEmits<{ confirmed: []; dismiss: []; clarify: [text: string] }>()
</script>

<template>
  <EstimateCard
    v-if="card.kind === 'estimate'"
    :card="card"
    :pending="pending"
    @confirmed="$emit('confirmed')"
    @dismiss="$emit('dismiss')"
    @clarify="$emit('clarify', $event)"
  />
  <TargetChangeCard
    v-else-if="card.kind === 'target_change'"
    :card="card"
    :pending="pending"
    @confirmed="$emit('confirmed')"
    @dismiss="$emit('dismiss')"
  />
  <WorkoutCard
    v-else-if="card.kind === 'workout'"
    :card="card"
    :pending="pending"
    @confirmed="$emit('confirmed')"
    @dismiss="$emit('dismiss')"
  />
  <MealCard
    v-else-if="card.kind === 'meal'"
    :card="card"
    :pending="pending"
    @confirmed="$emit('confirmed')"
    @dismiss="$emit('dismiss')"
  />
  <NoteCard
    v-else
    :card="card"
    :pending="pending"
    @confirmed="$emit('confirmed')"
    @dismiss="$emit('dismiss')"
  />
</template>
