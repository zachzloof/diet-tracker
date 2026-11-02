<script setup lang="ts">
import type { NoteCard } from '@diet-tracker/shared'
import { ref } from 'vue'
import { useCreateNote } from '@/features/coach/useCoach'
import { ApiError } from '@/lib/api'
import CardFrame from './CardFrame.vue'

/** "Remember that my left knee is sore": the line, kept on Remember through `POST /coach/notes`. */
const props = defineProps<{ card: NoteCard; pending?: boolean }>()
const emit = defineEmits<{ confirmed: []; dismiss: [] }>()

const create = useCreateNote()
const error = ref<string | null>(null)

function confirm(): void {
  error.value = null
  create.mutate(props.card.text, {
    onSuccess: () => emit('confirmed'),
    onError: (e: unknown) => {
      error.value = e instanceof ApiError ? e.message : 'Could not save the note.'
    },
  })
}
</script>

<template>
  <CardFrame
    icon="bookmark"
    title="Remember this"
    :state="card.state"
    confirm-label="Remember"
    confirmed-label="Remembered"
    :pending="pending"
    :saving="create.isPending.value"
    :error="error"
    @confirm="confirm"
    @dismiss="emit('dismiss')"
  >
    <p class="text-base text-fg">“{{ card.text }}”</p>
    <p v-if="card.state === 'drafted'" class="mt-1 text-xs text-fg-muted">
      The coach reads your notes every time you ask it something. Delete one under Notes.
    </p>
  </CardFrame>
</template>
