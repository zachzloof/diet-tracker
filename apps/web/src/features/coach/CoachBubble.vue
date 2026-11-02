<script setup lang="ts">
import { computed } from 'vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'

/**
 * One message. The person's on the right in the accent tint; the coach's on the left on a
 * surface, with the lines it looked at ("Looking at your last 5 squat sessions") above
 * the text so data and opinion read apart. While streaming, the latest status pulses and
 * the text grows in place; a failed answer shows the failure copy with a retry.
 */
const props = defineProps<{
  role: 'user' | 'assistant'
  text: string
  /** Status lines of the tools used, in order. */
  trail?: readonly string[]
  /** The line in progress, shown with a pulse. */
  status?: string | null
  streaming?: boolean
  error?: string | null
  /** The time, already formatted, under the bubble. */
  time?: string
}>()

const emit = defineEmits<{ retry: [] }>()

/** Split on blank lines so a two-paragraph answer keeps its gap without rendering HTML. */
const paragraphs = computed(() =>
  props.text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0),
)
const waiting = computed(() => props.streaming && props.text.length === 0 && !props.status)
</script>

<template>
  <div class="flex" :class="role === 'user' ? 'justify-end' : 'justify-start'">
    <div class="max-w-[88%] min-w-0" :class="role === 'user' ? 'items-end' : 'items-start'">
      <ul
        v-if="trail && trail.length"
        class="mb-1 space-y-0.5 px-1 text-xs text-fg-muted"
        aria-label="What the coach looked at"
      >
        <li v-for="(line, i) in trail" :key="i" class="flex items-center gap-1">
          <Icon name="search" :size="12" class="shrink-0" />
          {{ line }}
        </li>
      </ul>
      <p
        v-if="status"
        class="mb-1 flex animate-pulse items-center gap-1 px-1 text-xs text-fg-muted"
        role="status"
      >
        <Icon name="search" :size="12" class="shrink-0" />
        {{ status }}
      </p>
      <div
        class="rounded-card px-4 py-3 text-base leading-snug break-words whitespace-pre-wrap"
        :class="
          role === 'user'
            ? 'rounded-br-md bg-accent/15 text-fg'
            : error
              ? 'rounded-bl-md border border-over/40 bg-surface text-fg'
              : 'rounded-bl-md border border-border bg-surface text-fg'
        "
      >
        <span v-if="waiting" class="inline-flex gap-1 py-1" aria-label="The coach is thinking">
          <span class="size-2 animate-bounce rounded-full bg-fg-muted [animation-delay:-0.3s]" />
          <span class="size-2 animate-bounce rounded-full bg-fg-muted [animation-delay:-0.15s]" />
          <span class="size-2 animate-bounce rounded-full bg-fg-muted" />
        </span>
        <template v-else>
          <p v-for="(p, i) in paragraphs" :key="i" :class="i > 0 && 'mt-3'">{{ p }}</p>
          <span
            v-if="streaming && text.length"
            class="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-fg-muted align-text-bottom"
            aria-hidden="true"
          />
        </template>
      </div>
      <div
        v-if="error || time"
        class="mt-1 flex items-center gap-2 px-1 text-xs text-fg-muted"
        :class="role === 'user' ? 'justify-end' : 'justify-start'"
      >
        <span v-if="time">{{ time }}</span>
        <Button v-if="error" variant="ghost" class="!h-8 !px-2 !text-xs" @click="emit('retry')">
          <Icon name="refresh" :size="14" /> Try again
        </Button>
      </div>
    </div>
  </div>
</template>
