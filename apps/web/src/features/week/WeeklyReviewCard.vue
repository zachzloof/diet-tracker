<script setup lang="ts">
import type { WeeklyReviewResponse } from '@diet-tracker/shared'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Skeleton from '@/components/ui/Skeleton.vue'

/**
 * The AI weekly review: what went well, two changes, one line of encouragement. Written
 * from the same numbers and gaps shown above it; it never sets a target.
 */
defineProps<{
  response: WeeklyReviewResponse | null
  loading: boolean
  regenerating: boolean
  error: string | null
  /** True when the request has not started (the week is still loading). */
  idle: boolean
}>()

const emit = defineEmits<{ retry: []; regenerate: [] }>()
</script>

<template>
  <Card>
    <div class="flex items-center justify-between gap-2">
      <h2 class="flex items-center gap-2 text-base font-semibold">
        <Icon name="sparkles" :size="20" class="text-accent" />
        Your week, reviewed
      </h2>
      <IconButton
        v-if="response?.review && !loading && !regenerating"
        label="Write it again"
        icon="refresh"
        @click="emit('regenerate')"
      />
    </div>

    <div v-if="loading || regenerating || idle" class="mt-3 space-y-2" aria-busy="true">
      <Skeleton class="h-4 w-full" />
      <Skeleton class="h-4 w-11/12" />
      <Skeleton class="h-4 w-2/3" />
      <p class="pt-1 text-xs text-fg-muted">
        {{ idle ? 'Waiting for the week…' : 'Reading your week…' }}
      </p>
    </div>

    <div v-else-if="response?.review" class="mt-3 space-y-3">
      <p class="text-sm leading-relaxed text-fg">{{ response.review.summary }}</p>

      <div v-if="response.review.wins.length">
        <h3 class="text-sm font-semibold text-fg">What went well</h3>
        <ul class="mt-1.5 space-y-1.5">
          <li
            v-for="win in response.review.wins"
            :key="win"
            class="flex gap-2 text-sm text-fg-muted"
          >
            <Icon name="check" :size="16" class="mt-0.5 shrink-0 text-met" />
            {{ win }}
          </li>
        </ul>
      </div>

      <div v-if="response.review.changes.length">
        <h3 class="text-sm font-semibold text-fg">
          {{ response.review.changes.length === 1 ? 'One change' : 'Two changes' }} for next week
        </h3>
        <ol class="mt-1.5 space-y-2.5">
          <li
            v-for="(change, i) in response.review.changes"
            :key="change.title"
            class="rounded-control border border-border bg-surface-2/60 p-3"
          >
            <p class="text-sm font-semibold text-fg">{{ i + 1 }}. {{ change.title }}</p>
            <p class="mt-1 text-sm text-fg-muted">{{ change.why }}</p>
            <p class="mt-1 text-sm text-fg">{{ change.how }}</p>
          </li>
        </ol>
      </div>

      <p class="text-sm text-fg-muted italic">{{ response.review.encouragement }}</p>
      <p class="text-xs text-fg-muted">
        Written by AI ({{ response.review.model }}) from the numbers above, covering
        {{ response.review.daysLogged }} logged days. It reads the week; it never sets a target.
      </p>
    </div>

    <div v-else-if="response && !response.review" class="mt-3">
      <p class="text-sm text-fg-muted">
        Log at least {{ response.minimumDays }} days this week and the review appears here.
        {{ response.daysLogged }} logged so far.
      </p>
    </div>

    <div v-else class="mt-3">
      <p class="text-sm text-fg-muted">{{ error ?? 'No review yet.' }}</p>
      <Button class="mt-3" variant="secondary" @click="emit('retry')">Try again</Button>
    </div>
  </Card>
</template>
