<script setup lang="ts">
import { COMMON_ALLERGENS } from '@diet-tracker/shared'
import Chip from '@/components/ui/Chip.vue'
import TagInput from '@/components/ui/TagInput.vue'
import { injectDraft } from '../useOnboardingDraft'

const draft = injectDraft()

function toggle(item: string): void {
  draft.allergies = draft.allergies.includes(item)
    ? draft.allergies.filter((existing) => existing !== item)
    : [...draft.allergies, item]
}
</script>

<template>
  <div class="space-y-5">
    <div class="space-y-2">
      <span class="block text-sm font-medium text-fg-muted">Common ones</span>
      <div class="flex flex-wrap gap-2" role="group" aria-label="Common allergens">
        <button
          v-for="item in COMMON_ALLERGENS"
          :key="item"
          type="button"
          :aria-pressed="draft.allergies.includes(item)"
          @click="toggle(item)"
        >
          <Chip :tone="draft.allergies.includes(item) ? 'accent' : 'neutral'">{{ item }}</Chip>
        </button>
      </div>
    </div>
    <TagInput
      v-model="draft.allergies"
      label="Anything else"
      placeholder="e.g. kiwi"
      helper="Tap a tag to remove it."
    />
  </div>
</template>
