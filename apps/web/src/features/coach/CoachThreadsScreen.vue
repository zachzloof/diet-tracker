<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
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
import { useCoachThreads, useDeleteThread } from './useCoach'

/** Recent chats, newest first; a tap reopens one, the bin asks before deleting. */
const router = useRouter()
const ui = useUiStore()
const threads = useCoachThreads()
const remove = useDeleteThread()
const confirming = ref<{ id: string; title: string } | null>(null)

const open = computed({
  get: () => confirming.value !== null,
  set: (value: boolean) => {
    if (!value) confirming.value = null
  },
})

function when(iso: string): string {
  const day = iso.slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)
  return day === today
    ? new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : formatDay(day)
}

function confirmDelete(): void {
  const target = confirming.value
  if (!target) return
  remove.mutate(target.id, {
    onSuccess: () => {
      confirming.value = null
      ui.toast('Chat deleted', 'success')
    },
    onError: (error) => ui.toast(error.message, 'error'),
  })
}
</script>

<template>
  <AppShell title="Your chats" :back="{ name: 'coach' }">
    <template #header-right>
      <IconButton label="New chat" icon="plus" @click="router.push({ name: 'coach-new' })" />
    </template>

    <RouterLink
      :to="{ name: 'coach-notes' }"
      class="mb-3 flex min-h-14 items-center gap-3 rounded-card border border-border bg-surface px-4 py-2 transition hover:bg-surface-2"
    >
      <Icon name="bookmark" :size="20" class="shrink-0 text-accent" />
      <span class="min-w-0 flex-1">
        <span class="block text-base font-medium text-fg">Notes</span>
        <span class="block truncate text-sm text-fg-muted"
          >What you asked the coach to remember</span
        >
      </span>
      <Icon name="chevron-right" :size="18" class="shrink-0 text-fg-muted" />
    </RouterLink>

    <div
      v-if="threads.isLoading.value && !threads.hasData.value"
      class="space-y-2"
      aria-busy="true"
    >
      <Skeleton class="h-16 w-full" rounded="card" />
      <Skeleton class="h-16 w-full" rounded="card" />
      <Skeleton class="h-16 w-full" rounded="card" />
    </div>

    <Card v-else-if="threads.isError.value && !threads.hasData.value">
      <h2 class="flex items-center gap-2 text-base font-semibold">
        <Icon :name="ui.online ? 'alert' : 'wifi-off'" :size="20" class="text-fg-muted" />
        {{ ui.online ? "Couldn't load your chats" : "You're offline" }}
      </h2>
      <p class="mt-1 text-sm text-fg-muted">
        {{ threads.error.value?.message ?? 'Something went wrong.' }}
      </p>
      <Button class="mt-4" variant="secondary" @click="threads.refetch()">Try again</Button>
    </Card>

    <Card v-else-if="threads.threads.value.length === 0" :padded="false">
      <EmptyState
        icon="sparkles"
        title="No chats yet"
        description="Ask the coach anything about your food, targets and training."
      >
        <Button @click="router.push({ name: 'coach-new' })">
          <Icon name="plus" :size="20" /> New chat
        </Button>
      </EmptyState>
    </Card>

    <ul v-else class="divide-y divide-border rounded-card border border-border bg-surface">
      <li v-for="thread in threads.threads.value" :key="thread.id" class="flex items-center">
        <RouterLink
          :to="{ name: 'coach-thread', params: { id: thread.id } }"
          class="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-2 transition hover:bg-surface-2"
        >
          <span class="min-w-0 flex-1">
            <span class="block truncate text-base font-medium text-fg">{{ thread.title }}</span>
            <span class="block text-sm text-fg-muted">
              {{ when(thread.updatedAt) }} · {{ thread.turns }}
              {{ thread.turns === 1 ? 'question' : 'questions' }}
            </span>
          </span>
        </RouterLink>
        <IconButton
          label="Delete chat"
          icon="trash"
          class="mr-1"
          @click="confirming = { id: thread.id, title: thread.title }"
        />
      </li>
    </ul>

    <Sheet v-model:open="open" title="Delete this chat?">
      <p class="text-sm text-fg-muted">
        "{{ confirming?.title }}" and the coach's answers in it will be removed from your account.
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
