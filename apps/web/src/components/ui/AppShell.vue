<script setup lang="ts">
import { ref } from 'vue'
import QuickAddSheet from '@/features/log/QuickAddSheet.vue'
import TabBar from './TabBar.vue'

defineProps<{ title: string }>()

const quickAddOpen = ref(false)
</script>

<template>
  <div class="min-h-dvh bg-bg text-fg">
    <header
      class="fixed inset-x-0 top-0 z-20 border-b border-border bg-bg/90 backdrop-blur"
      :style="{ paddingTop: 'env(safe-area-inset-top)' }"
    >
      <div class="mx-auto flex h-14 max-w-[480px] items-center justify-between px-4">
        <h1 class="text-xl font-semibold">{{ title }}</h1>
        <slot name="header-right" />
      </div>
    </header>

    <main
      class="mx-auto max-w-[480px] px-4"
      :style="{
        paddingTop: 'calc(3.5rem + env(safe-area-inset-top) + 1rem)',
        paddingBottom: 'calc(5rem + env(safe-area-inset-bottom) + 1rem)',
      }"
    >
      <slot />
    </main>

    <TabBar @add="quickAddOpen = true" />
    <QuickAddSheet v-model:open="quickAddOpen" />
  </div>
</template>
