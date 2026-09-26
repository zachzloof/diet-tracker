<script setup lang="ts">
import { onErrorCaptured, onMounted, ref } from 'vue'
import { RouterView } from 'vue-router'
import ErrorScreen from '@/components/ui/ErrorScreen.vue'
import OfflineBanner from '@/components/ui/OfflineBanner.vue'
import Toast from '@/components/ui/Toast.vue'
import { useQueueStore } from '@/stores/queue'
import { useRemindersStore } from '@/stores/reminders'
import { useUiStore } from '@/stores/ui'

// Instantiating the store applies the saved theme before the first paint.
useUiStore()

// Error boundary: a render or lifecycle error anywhere below lands on a screen with a
// way out instead of a blank page.
const fatal = ref<Error | null>(null)
onErrorCaptured((error) => {
  fatal.value = error instanceof Error ? error : new Error(String(error))
  console.error(error)
  return false
})

// Reminders run on a timer in this tab; queued writes go out as soon as we are online.
useRemindersStore().start()
const queue = useQueueStore()
onMounted(() => {
  window.addEventListener('online', () => void queue.flush())
  void queue.flush()
})
</script>

<template>
  <ErrorScreen v-if="fatal" :error="fatal" />
  <template v-else>
    <OfflineBanner />
    <RouterView />
    <Toast />
  </template>
</template>
