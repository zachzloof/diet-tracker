<script setup lang="ts">
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { computed } from 'vue'
import IconButton from './IconButton.vue'
import { useKeyboardInset } from './useKeyboardInset'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  title: string
  description?: string
  /**
   * `auto` hugs its content. `tall` always fills the screen up to just under the status
   * bar, so the sheet never changes height as its content does and fields sit high enough
   * to stay visible above the keyboard.
   */
  size?: 'auto' | 'tall'
}>()

const tall = computed(() => props.size === 'tall')
const keyboardInset = useKeyboardInset()

const contentStyle = computed(() => ({
  paddingBottom: `max(env(safe-area-inset-bottom), ${keyboardInset.value}px)`,
  ...(tall.value ? { top: 'calc(env(safe-area-inset-top) + 24px)' } : {}),
}))
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay
        class="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in"
      />
      <DialogContent
        class="group fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-[480px] flex-col rounded-t-[20px] border-t border-border bg-surface shadow-card outline-none data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet-in"
        :class="tall ? '' : 'max-h-[88dvh]'"
        :style="contentStyle"
      >
        <div class="mx-auto mt-2 h-1.5 w-10 rounded-full bg-border" aria-hidden="true" />
        <div class="flex items-center justify-between pt-2 pr-2 pl-4">
          <DialogTitle class="text-xl font-semibold text-fg">{{ title }}</DialogTitle>
          <DialogClose as-child>
            <IconButton label="Close" icon="x" />
          </DialogClose>
        </div>
        <DialogDescription v-if="description" class="px-4 pt-1 text-sm text-fg-muted">
          {{ description }}
        </DialogDescription>
        <div
          class="overflow-y-auto overscroll-contain px-4 pt-3 pb-4 group-data-[state=open]:animate-sheet-body"
          :class="tall ? 'min-h-0 flex-1' : 'max-h-[calc(88dvh-5rem)]'"
        >
          <slot />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
