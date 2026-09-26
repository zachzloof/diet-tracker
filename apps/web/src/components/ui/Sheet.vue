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
import IconButton from './IconButton.vue'

const open = defineModel<boolean>('open', { default: false })

defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/50 data-[state=open]:animate-fade-in" />
      <DialogContent
        class="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] max-w-[480px] flex-col rounded-t-[20px] border-t border-border bg-surface shadow-card outline-none data-[state=open]:animate-slide-up"
        :style="{ paddingBottom: 'env(safe-area-inset-bottom)' }"
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
        <div class="max-h-[calc(88dvh-5rem)] overflow-y-auto px-4 pt-3 pb-4">
          <slot />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
