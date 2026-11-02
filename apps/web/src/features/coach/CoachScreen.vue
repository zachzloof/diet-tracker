<script setup lang="ts">
import { COACH_MAX_TURNS } from '@diet-tracker/shared'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/ui/AppShell.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Chip from '@/components/ui/Chip.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import AiConsent from '@/features/ai/AiConsent.vue'
import { useAppMode } from '@/features/mode/useAppMode'
import { ApiError } from '@/lib/api'
import { formatMealTime } from '@/lib/format'
import { useAiConsentStore } from '@/stores/ai-consent'
import { useCoachStore } from '@/stores/coach'
import { useUiStore } from '@/stores/ui'
import CoachBubble from './CoachBubble.vue'
import CoachComposer from './CoachComposer.vue'
import { useCoachThread, useCoachThreads } from './useCoach'

/**
 * `/coach` (D41): the latest chat, `/coach/:id` one chat, `/coach/new` a fresh one. The
 * consent card comes first; then an empty state with three questions to tap, or the
 * thread with the answer streaming in word by word. The composer is pinned above the
 * keyboard; the list scrolls under it and follows the newest line.
 */
const route = useRoute()
const router = useRouter()
const ui = useUiStore()
const consent = useAiConsentStore()
const coach = useCoachStore()
const { mode } = useAppMode()

const SUGGESTIONS = [
  'How am I doing this week?',
  'What should I eat tonight to hit my protein?',
  'Am I getting stronger?',
]

const routeId = computed(() => (typeof route.params.id === 'string' ? route.params.id : null))
const isNew = computed(() => route.name === 'coach-new')
const threads = useCoachThreads()
/** `/coach` opens the most recent chat once the list is in; `/coach/new` never does. */
const threadId = computed(() => {
  if (routeId.value) return routeId.value
  if (isNew.value) return null
  return threads.threads.value[0]?.id ?? null
})
const resolvingLatest = computed(
  () => !routeId.value && !isNew.value && threads.isLoading.value && !threads.hasData.value,
)

const thread = useCoachThread(threadId)
const draft = ref('')

const pending = computed(() =>
  coach.pending && (threadId.value === null || coach.pending.threadId === threadId.value)
    ? coach.pending
    : null,
)
const busy = computed(() => pending.value !== null && pending.value.error === null)
const full = computed(() => (thread.thread.value?.turns ?? 0) >= COACH_MAX_TURNS)
const composerReason = computed(() => {
  if (!ui.online) return 'The coach needs a connection.'
  if (full.value) return 'This chat is full. Start a new chat to carry on.'
  return null
})
const showEmpty = computed(
  () =>
    pending.value === null &&
    (threadId.value === null || (thread.hasData.value && thread.messages.value.length === 0)),
)

function scrollToEnd(): void {
  void nextTick(() => window.scrollTo({ top: document.documentElement.scrollHeight }))
}
watch(
  () => [pending.value?.streamed.length, pending.value?.status, thread.messages.value.length],
  scrollToEnd,
)
onMounted(scrollToEnd)

async function send(text: string): Promise<void> {
  const message = text.trim()
  if (!message || busy.value) return
  draft.value = ''
  try {
    const id = await coach.send(threadId.value, message)
    if (routeId.value !== id) await router.replace({ name: 'coach-thread', params: { id } })
  } catch (error) {
    const reason = error instanceof ApiError ? error.message : 'The coach is unavailable right now.'
    if (error instanceof ApiError && error.code === 'ai_cap_reached') {
      coach.clear()
      draft.value = message
    }
    ui.toast(reason, 'error')
  }
}

/** A failed turn: the text goes back in the box and the person taps send again. */
function retryPending(): void {
  const text = pending.value?.text ?? ''
  coach.clear()
  void send(text)
}

function retryStored(text: string): void {
  void send(text)
}

const back = computed(() => ({ name: mode.value === 'training' ? 'gym-today' : 'today' }))
</script>

<template>
  <AppShell title="Coach" :back="back" hide-tabs>
    <template #header-right>
      <IconButton
        label="Your chats"
        icon="history"
        @click="router.push({ name: 'coach-threads' })"
      />
    </template>

    <Card v-if="!consent.granted">
      <AiConsent
        lead="Ask the coach about your food, targets and training. It answers with your numbers."
        also="The coach also sends the food log for the days it looks at, your workouts and your weigh-ins."
      />
    </Card>

    <div
      v-else-if="resolvingLatest || (threadId && thread.isLoading.value && !pending)"
      class="space-y-3"
      aria-busy="true"
    >
      <Skeleton class="ml-auto h-12 w-3/5" rounded="card" />
      <Skeleton class="h-24 w-4/5" rounded="card" />
      <Skeleton class="ml-auto h-12 w-2/5" rounded="card" />
    </div>

    <Card v-else-if="threadId && thread.isError.value && !thread.hasData.value">
      <h2 class="flex items-center gap-2 text-base font-semibold">
        <Icon :name="ui.online ? 'alert' : 'wifi-off'" :size="20" class="text-fg-muted" />
        {{ ui.online ? "Couldn't load this chat" : "You're offline" }}
      </h2>
      <p class="mt-1 text-sm text-fg-muted">
        {{ thread.error.value?.message ?? 'Something went wrong.' }}
      </p>
      <div class="mt-4 flex gap-2">
        <Button variant="secondary" @click="thread.refetch()">Try again</Button>
        <Button variant="ghost" @click="router.replace({ name: 'coach-new' })">New chat</Button>
      </div>
    </Card>

    <Card v-else-if="showEmpty" :padded="false">
      <EmptyState
        icon="sparkles"
        title="Ask the coach"
        description="It knows your log, targets, workouts and weigh-ins, and answers with your numbers."
      >
        <div class="flex flex-wrap justify-center gap-2">
          <button
            v-for="question in SUGGESTIONS"
            :key="question"
            type="button"
            class="rounded-full transition active:scale-95"
            :disabled="!ui.online || busy"
            @click="send(question)"
          >
            <Chip tone="accent">{{ question }}</Chip>
          </button>
        </div>
      </EmptyState>
    </Card>

    <div v-else class="space-y-3" aria-live="polite">
      <template v-for="message in thread.messages.value" :key="message.id">
        <CoachBubble
          :role="message.role"
          :text="message.text"
          :trail="message.toolTrail.map((t) => t.summary)"
          :error="message.error"
          :time="message.role === 'assistant' ? formatMealTime(message.createdAt) : undefined"
          @retry="
            retryStored(
              thread.messages.value[thread.messages.value.indexOf(message) - 1]?.text ?? '',
            )
          "
        />
      </template>
      <template v-if="pending">
        <CoachBubble role="user" :text="pending.text" />
        <CoachBubble
          role="assistant"
          :text="pending.error ? pending.error : pending.streamed"
          :trail="pending.statuses.filter((s) => s !== pending?.status)"
          :status="pending.status"
          :streaming="!pending.error"
          :error="pending.error"
          @retry="retryPending"
        />
      </template>
    </div>

    <template v-if="consent.granted" #footer>
      <div v-if="full" class="flex items-center justify-between gap-3 py-1">
        <p class="text-sm text-fg-muted">This chat is full.</p>
        <Button @click="router.push({ name: 'coach-new' })">
          <Icon name="plus" :size="20" /> New chat
        </Button>
      </div>
      <CoachComposer
        v-else
        v-model="draft"
        :disabled="!ui.online"
        :busy="busy"
        :reason="composerReason"
        @send="send(draft)"
      />
    </template>
  </AppShell>
</template>
