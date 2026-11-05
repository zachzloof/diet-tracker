<script setup lang="ts">
import type { CoachBriefHalf } from '@diet-tracker/shared'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useLocalDay } from '@/features/log/useLocalDay'
import { ApiError } from '@/lib/api'
import { useAiConsentStore } from '@/stores/ai-consent'
import { useUiStore } from '@/stores/ui'
import { useCoachBrief, useOpenBrief } from './useCoach'

/**
 * The one-line daily brief at the top of Today (slice 11c): where things stand and what
 * is left, built by the app from the same numbers as the tiles below and refreshed after
 * every log or session write. Tapping it opens a chat that starts with the line. Nothing
 * shows until AI features are allowed (the line is the way into the coach), and nothing
 * shows when it cannot be fetched: the brief is a bonus, never a blocker.
 */
const props = defineProps<{ half: CoachBriefHalf }>()

const router = useRouter()
const ui = useUiStore()
const consent = useAiConsentStore()
const { today } = useLocalDay()
const enabled = computed(() => consent.granted)
const brief = useCoachBrief(() => props.half, today, enabled)
const open = useOpenBrief()
const opening = ref(false)

async function tap(): Promise<void> {
  if (opening.value || !ui.online) return
  opening.value = true
  try {
    const thread = await open.mutateAsync(props.half)
    await router.push({ name: 'coach-thread', params: { id: thread.id } })
  } catch (error) {
    ui.toast(
      error instanceof ApiError ? error.message : 'Could not open the coach right now.',
      'error',
    )
  } finally {
    opening.value = false
  }
}
</script>

<template>
  <div
    v-if="enabled && brief.isLoading.value"
    class="flex items-center gap-3 px-1 py-2"
    aria-busy="true"
  >
    <Skeleton class="size-5 shrink-0 rounded-full" />
    <Skeleton class="h-4 w-4/5" />
  </div>
  <button
    v-else-if="enabled && brief.brief.value"
    type="button"
    class="flex min-h-12 w-full items-center gap-3 rounded-card border border-accent/30 bg-accent/10 px-3 py-2.5 text-left transition active:scale-[0.99] disabled:opacity-70"
    :disabled="opening || !ui.online"
    :aria-busy="opening"
    @click="tap"
  >
    <Icon name="sparkles" :size="20" class="shrink-0 text-accent" aria-hidden="true" />
    <span class="min-w-0 flex-1 text-base leading-snug text-fg">{{ brief.brief.value.text }}</span>
    <Icon
      :name="opening ? 'clock' : 'chevron-right'"
      :size="18"
      class="shrink-0 text-fg-muted"
      aria-hidden="true"
    />
    <span class="sr-only">Ask the coach about this</span>
  </button>
</template>
