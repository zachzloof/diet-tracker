<script setup lang="ts">
import { computed, ref } from 'vue'
import AppShell from '@/components/ui/AppShell.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Sheet from '@/components/ui/Sheet.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { formatDay } from '@/lib/format'
import { useUiStore } from '@/stores/ui'
import { useCoachNotes, useDeleteNote } from './useCoach'

/**
 * Coach > Notes (slice 11b): the lines the person asked the coach to remember, each one
 * confirmed from a note card. Every note goes into the coach's briefing; the bin takes it
 * out for good.
 */
const ui = useUiStore()
const notes = useCoachNotes()
const remove = useDeleteNote()
const confirming = ref<{ id: string; text: string } | null>(null)

const open = computed({
  get: () => confirming.value !== null,
  set: (value: boolean) => {
    if (!value) confirming.value = null
  },
})

function confirmDelete(): void {
  const target = confirming.value
  if (!target) return
  remove.mutate(target.id, {
    onSuccess: () => {
      confirming.value = null
      ui.toast('Note deleted', 'success')
    },
    onError: (error) => ui.toast(error.message, 'error'),
  })
}
</script>

<template>
  <AppShell title="Notes" :back="{ name: 'coach' }">
    <p class="mb-3 px-1 text-sm text-fg-muted">
      Things you asked the coach to remember. It reads them every time you ask it something.
    </p>

    <div v-if="notes.isLoading.value && !notes.hasData.value" class="space-y-2" aria-busy="true">
      <Skeleton class="h-14 w-full" rounded="card" />
      <Skeleton class="h-14 w-full" rounded="card" />
    </div>

    <Card v-else-if="notes.isError.value && !notes.hasData.value">
      <h2 class="flex items-center gap-2 text-base font-semibold">
        <Icon :name="ui.online ? 'alert' : 'wifi-off'" :size="20" class="text-fg-muted" />
        {{ ui.online ? "Couldn't load your notes" : "You're offline" }}
      </h2>
      <p class="mt-1 text-sm text-fg-muted">
        {{ notes.error.value?.message ?? 'Something went wrong.' }}
      </p>
      <Button class="mt-4" variant="secondary" @click="notes.refetch()">Try again</Button>
    </Card>

    <Card v-else-if="notes.notes.value.length === 0" :padded="false">
      <EmptyState
        icon="bookmark"
        title="Nothing remembered yet"
        description="Tell the coach “remember that my left knee is sore” and confirm the card it drafts."
      />
    </Card>

    <ul v-else class="divide-y divide-border rounded-card border border-border bg-surface">
      <li
        v-for="note in notes.notes.value"
        :key="note.id"
        class="flex min-h-14 items-center gap-3 py-2 pr-1 pl-4"
      >
        <span class="min-w-0 flex-1">
          <span class="block text-base text-fg">{{ note.text }}</span>
          <span class="block text-sm text-fg-muted">{{
            formatDay(note.createdAt.slice(0, 10))
          }}</span>
        </span>
        <IconButton
          label="Delete note"
          icon="trash"
          :disabled="!ui.online"
          @click="confirming = { id: note.id, text: note.text }"
        />
      </li>
    </ul>

    <Sheet v-model:open="open" title="Delete this note?">
      <p class="text-sm text-fg-muted">
        “{{ confirming?.text }}” will be forgotten. The coach stops seeing it straight away.
      </p>
      <div class="mt-4 flex gap-2">
        <Button variant="secondary" block @click="open = false">Keep</Button>
        <Button
          variant="destructive"
          block
          :loading="remove.isPending.value"
          @click="confirmDelete"
        >
          Delete
        </Button>
      </div>
    </Sheet>
  </AppShell>
</template>
