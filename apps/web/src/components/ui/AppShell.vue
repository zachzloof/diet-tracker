<script setup lang="ts">
import { useRouter, type RouteLocationRaw } from 'vue-router'
import QuickAddSheet from '@/features/log/QuickAddSheet.vue'
import { useUiStore } from '@/stores/ui'
import IconButton from './IconButton.vue'
import TabBar from './TabBar.vue'

const props = defineProps<{
  title: string
  /** Where "back" goes when this is a pushed detail screen and there is no history. */
  back?: RouteLocationRaw
}>()

const router = useRouter()
const ui = useUiStore()

function goBack(): void {
  if (!props.back) return
  const state: unknown = window.history.state
  const hasHistory =
    typeof state === 'object' && state !== null && Reflect.get(state, 'back') !== null
  if (hasHistory) router.back()
  else void router.replace(props.back)
}
</script>

<template>
  <div class="min-h-dvh bg-bg text-fg">
    <header
      class="fixed inset-x-0 top-0 z-20 border-b border-border bg-bg/90 backdrop-blur"
      :style="{ paddingTop: 'env(safe-area-inset-top)' }"
    >
      <div
        class="mx-auto flex h-14 max-w-[480px] items-center justify-between"
        :class="back ? 'pr-4 pl-1' : 'px-4'"
      >
        <div class="flex min-w-0 items-center gap-1">
          <IconButton v-if="back" label="Back" icon="chevron-left" @click="goBack" />
          <h1 class="truncate text-xl font-semibold">{{ title }}</h1>
        </div>
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

    <TabBar @add="ui.openQuickAdd()" />
    <QuickAddSheet />
  </div>
</template>
