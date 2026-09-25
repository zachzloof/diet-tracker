<script setup lang="ts">
import TagInput from '@/components/ui/TagInput.vue'
import { injectDraft } from '../useOnboardingDraft'

const draft = injectDraft()
</script>

<template>
  <TagInput
    v-model="draft.dislikes"
    label="Foods you avoid"
    placeholder="e.g. coriander, liver"
    helper="Tap a tag to remove it."
  />
</template>
