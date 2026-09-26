<script setup lang="ts">
import Button from './Button.vue'
import Icon from './Icon.vue'

/** The error boundary's fallback: what happened in plain words, and two ways out. */
defineProps<{ error: Error }>()

function reload(): void {
  window.location.reload()
}
function home(): void {
  window.location.assign('/')
}
</script>

<template>
  <div
    class="flex min-h-dvh flex-col items-center justify-center bg-bg px-6 text-center text-fg"
    :style="{
      paddingTop: 'env(safe-area-inset-top)',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }"
    role="alert"
  >
    <div
      class="flex size-14 items-center justify-center rounded-full bg-over/15 text-over"
      aria-hidden="true"
    >
      <Icon name="alert" :size="26" />
    </div>
    <h1 class="mt-4 text-xl font-semibold">Something went wrong</h1>
    <p class="mt-1 max-w-xs text-base text-fg-muted">
      The screen hit an error it could not recover from. Your data is safe; reloading usually fixes
      it.
    </p>
    <p class="mt-3 max-w-xs truncate text-xs text-fg-muted" :title="error.message">
      {{ error.message }}
    </p>
    <div class="mt-6 flex w-full max-w-xs flex-col gap-2">
      <Button block @click="reload">Reload</Button>
      <Button block variant="secondary" @click="home">Go to Today</Button>
    </div>
  </div>
</template>
