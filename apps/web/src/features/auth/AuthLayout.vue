<script setup lang="ts">
defineProps<{ title: string; subtitle: string }>()
</script>

<template>
  <div
    class="flex min-h-dvh flex-col bg-bg text-fg"
    :style="{
      paddingTop: 'calc(env(safe-area-inset-top) + 2.5rem)',
      paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)',
    }"
  >
    <main class="mx-auto flex w-full max-w-[480px] flex-1 flex-col px-4">
      <div class="mb-8 flex items-center gap-3">
        <img src="/favicon.svg" alt="" width="40" height="40" class="rounded-[10px]" />
        <span class="text-base font-semibold text-fg-muted">Diet Tracker</span>
      </div>
      <h1 class="text-[28px] leading-tight font-bold">{{ title }}</h1>
      <p class="mt-1 text-base text-fg-muted">{{ subtitle }}</p>
      <div class="mt-8">
        <slot />
      </div>
      <div class="mt-auto pt-8 text-center text-sm text-fg-muted">
        <slot name="footer" />
      </div>
    </main>
  </div>
</template>
