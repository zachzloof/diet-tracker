<script setup lang="ts">
import { useUiStore } from '@/stores/ui'
import Icon from './Icon.vue'

const ui = useUiStore()
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="-translate-y-full"
    leave-active-class="transition duration-150 ease-in"
    leave-to-class="-translate-y-full"
  >
    <div
      v-if="!ui.online"
      class="fixed inset-x-0 top-0 z-50 bg-close text-black"
      :style="{ paddingTop: 'env(safe-area-inset-top)' }"
      role="status"
    >
      <div
        class="mx-auto flex h-8 max-w-[480px] items-center justify-center gap-2 px-4 text-sm font-medium"
      >
        <Icon name="wifi-off" :size="16" />
        You're offline. Some actions are unavailable.
      </div>
    </div>
  </Transition>
</template>
