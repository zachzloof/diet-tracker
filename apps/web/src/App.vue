<script setup lang="ts">
import { RouterView } from 'vue-router'
import OfflineBanner from '@/components/ui/OfflineBanner.vue'
import Toast from '@/components/ui/Toast.vue'
import { useUiStore } from '@/stores/ui'

// Instantiating the store applies the saved theme before the first paint.
useUiStore()
</script>

<template>
  <OfflineBanner />
  <RouterView />
  <Toast />
</template>
