<script setup lang="ts">
import { useRouter } from 'vue-router'
import IconButton from '@/components/ui/IconButton.vue'

/** The sparkles in the header's right column on every root screen of both halves (D41). */
const router = useRouter()
</script>

<template>
  <IconButton label="Ask the coach" icon="sparkles" @click="router.push({ name: 'coach' })" />
</template>
