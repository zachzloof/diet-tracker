<script setup lang="ts">
import { useUiStore } from '@/stores/ui'
import Icon, { type IconName } from './Icon.vue'
import type { ToastKind } from '@/stores/ui'

const ui = useUiStore()

const ICONS: Record<ToastKind, IconName> = { info: 'sparkles', success: 'check', error: 'alert' }
const TONES: Record<ToastKind, string> = {
  info: 'border-border',
  success: 'border-met/50',
  error: 'border-over/50',
}
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4"
    :style="{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }"
    aria-live="polite"
    aria-atomic="true"
  >
    <TransitionGroup
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="-translate-y-2 opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <button
        v-for="item in ui.toasts"
        :key="item.id"
        type="button"
        class="pointer-events-auto flex w-full max-w-[448px] items-center gap-3 rounded-card border bg-surface px-4 py-3 text-left text-base text-fg shadow-card"
        :class="TONES[item.kind]"
        @click="ui.dismissToast(item.id)"
      >
        <Icon :name="ICONS[item.kind]" :size="20" class="shrink-0 text-fg-muted" />
        <span class="min-w-0 flex-1">{{ item.message }}</span>
      </button>
    </TransitionGroup>
  </div>
</template>
