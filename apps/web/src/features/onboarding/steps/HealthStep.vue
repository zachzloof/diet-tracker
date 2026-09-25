<script setup lang="ts">
import { computed } from 'vue'
import Toggle from '@/components/ui/Toggle.vue'
import { injectDraft } from '../useOnboardingDraft'

const draft = injectDraft()
const anyFlag = computed(
  () => draft.flags.pregnant || draft.flags.breastfeeding || draft.flags.edHistory,
)
</script>

<template>
  <div class="space-y-2">
    <div class="divide-y divide-border rounded-card border border-border bg-surface px-4">
      <Toggle v-model="draft.flags.pregnant" label="Pregnant" />
      <Toggle v-model="draft.flags.breastfeeding" label="Breastfeeding" />
      <Toggle
        v-model="draft.flags.edHistory"
        label="History of disordered eating"
        description="Any past or present eating disorder"
      />
    </div>
    <p v-if="anyFlag" class="rounded-card border border-close/40 bg-close/10 p-4 text-sm text-fg">
      Thanks for telling us. Your targets will be set to maintenance with no deficit, and the app
      will suggest working with a doctor or dietitian on anything beyond that.
    </p>
    <p v-else class="px-1 text-sm text-fg-muted">
      If any of these apply, the app never sets a calorie deficit.
    </p>
  </div>
</template>
