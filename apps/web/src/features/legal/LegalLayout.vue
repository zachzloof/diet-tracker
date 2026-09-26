<script setup lang="ts">
import { useRouter } from 'vue-router'
import IconButton from '@/components/ui/IconButton.vue'

/**
 * A plain reading layout for the privacy policy and the terms. No tab bar or session
 * lookups: these pages are open to anyone, signed in or not.
 */
defineProps<{ title: string; updated: string }>()

const router = useRouter()

function back(): void {
  const state: unknown = window.history.state
  const hasHistory =
    typeof state === 'object' && state !== null && Reflect.get(state, 'back') !== null
  if (hasHistory) router.back()
  else void router.replace({ name: 'today' })
}
</script>

<template>
  <div class="min-h-dvh bg-bg text-fg">
    <header
      class="fixed inset-x-0 top-0 z-20 border-b border-border bg-bg/90 backdrop-blur"
      :style="{ paddingTop: 'env(safe-area-inset-top)' }"
    >
      <div class="mx-auto flex h-14 max-w-[480px] items-center gap-1 pr-4 pl-1">
        <IconButton label="Back" icon="chevron-left" @click="back" />
        <h1 class="truncate text-xl font-semibold">{{ title }}</h1>
      </div>
    </header>
    <main
      class="mx-auto max-w-[480px] px-4"
      :style="{
        paddingTop: 'calc(3.5rem + env(safe-area-inset-top) + 1rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)',
      }"
    >
      <p class="text-sm text-fg-muted">Last updated {{ updated }}.</p>
      <article class="legal mt-4 space-y-4 text-base leading-relaxed text-fg">
        <slot />
      </article>
    </main>
  </div>
</template>

<style scoped>
.legal :deep(h2) {
  margin-top: 1.5rem;
  font-size: 1.25rem;
  font-weight: 600;
}
.legal :deep(ul) {
  list-style: disc;
  padding-left: 1.25rem;
}
.legal :deep(li + li) {
  margin-top: 0.25rem;
}
.legal :deep(a) {
  color: var(--accent);
  font-weight: 600;
}
</style>
