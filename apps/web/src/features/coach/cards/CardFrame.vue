<script setup lang="ts">
import type { CoachCardState } from '@diet-tracker/shared'
import Button from '@/components/ui/Button.vue'
import Chip from '@/components/ui/Chip.vue'
import Icon, { type IconName } from '@/components/ui/Icon.vue'
import { useUiStore } from '@/stores/ui'

/**
 * The shell every drafted card shares (slice 11b): an icon and a heading, the body the
 * card fills in, then the confirm and Dismiss buttons while it is still drafted, or a
 * chip saying what happened once it is confirmed or dismissed. A card still streaming in
 * (`pending`) shows its body with the buttons held until the turn is stored.
 */
const props = defineProps<{
  icon: IconName
  title: string
  state: CoachCardState
  /** The confirm button's words: "Add to breakfast", "Apply", "Start", "Save to meals", "Remember". */
  confirmLabel: string
  /** The chip once confirmed: "Logged", "Applied", "Started", "Saved", "Remembered". */
  confirmedLabel: string
  /**
   * The confirm works offline (the workout's Start, which only opens the session screen).
   * Absent boolean props read as false in Vue, so the flag is the exception, not the rule.
   */
  offlineOk?: boolean
  pending?: boolean
  saving?: boolean
  error?: string | null
  /** The body carries its own confirm button (the estimate review); hide the frame's. */
  ownConfirm?: boolean
}>()

const emit = defineEmits<{ confirm: []; dismiss: [] }>()
const ui = useUiStore()
</script>

<template>
  <section
    class="rounded-card border bg-surface p-4"
    :class="state === 'dismissed' ? 'border-border opacity-70' : 'border-accent/40'"
    :aria-label="title"
  >
    <header class="mb-3 flex items-center justify-between gap-2">
      <h3 class="flex min-w-0 items-center gap-2 text-sm font-semibold text-fg">
        <Icon :name="icon" :size="18" class="shrink-0 text-accent" />
        <span class="truncate">{{ title }}</span>
      </h3>
      <Chip v-if="state === 'confirmed'" tone="met" class="!h-6 !px-2 !text-xs">
        <Icon name="check" :size="12" /> {{ confirmedLabel }}
      </Chip>
      <Chip v-else-if="state === 'dismissed'" tone="neutral" class="!h-6 !px-2 !text-xs">
        Dismissed
      </Chip>
      <Chip v-else-if="pending" tone="neutral" class="!h-6 !px-2 !text-xs">Drafting…</Chip>
    </header>

    <slot />

    <template v-if="state === 'drafted'">
      <p v-if="error" class="mt-3 text-sm text-over" role="alert">{{ error }}</p>
      <div v-if="!pending" class="mt-3 flex gap-2">
        <Button
          v-if="!ownConfirm"
          class="flex-1"
          :disabled="!props.offlineOk && !ui.online"
          :loading="saving"
          @click="emit('confirm')"
        >
          {{ !props.offlineOk && !ui.online ? `${confirmLabel} (offline)` : confirmLabel }}
        </Button>
        <Button
          variant="ghost"
          :class="ownConfirm ? 'flex-1' : ''"
          :disabled="saving || !ui.online"
          @click="emit('dismiss')"
        >
          Dismiss
        </Button>
      </div>
      <p v-else class="mt-3 text-xs text-fg-muted">
        You can confirm it once the coach has finished.
      </p>
    </template>
  </section>
</template>
