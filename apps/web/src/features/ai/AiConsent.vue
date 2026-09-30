<script setup lang="ts">
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import { useAiConsentStore } from '@/stores/ai-consent'

/**
 * Shown in place of an AI feature until the person allows it (D25): says what is sent,
 * to whom, and what is not, then asks. One yes covers the estimate, the plan explanation
 * and the weekly review; Settings turns it off again.
 */
defineProps<{
  /** What the feature does, e.g. "Type what you ate and AI estimates the nutrients." */
  lead: string
}>()

const emit = defineEmits<{ navigate: [] }>()
const consent = useAiConsentStore()
</script>

<template>
  <div class="space-y-3 rounded-card border border-border bg-surface-2/60 p-3">
    <p class="flex gap-2 text-base font-semibold text-fg">
      <Icon name="sparkles" :size="20" class="mt-0.5 shrink-0 text-accent" />
      {{ lead }}
    </p>
    <p class="text-sm text-fg-muted">
      This uses AI from OpenAI, a separate company. When you use it, Minori sends OpenAI the food
      you describe, a summary of your profile (sex, age, height, weight, goal, activity, diet,
      allergies and dislikes) and your targets and week's numbers. It never sends your email
      address, and the requests are not kept to train AI models.
    </p>
    <p class="text-sm text-fg-muted">
      You can turn this off in Settings at any time.
      <RouterLink
        :to="{ name: 'privacy' }"
        class="font-semibold text-accent"
        @click="emit('navigate')"
      >
        Privacy policy
      </RouterLink>
    </p>
    <Button block @click="consent.grant()">Allow AI features</Button>
  </div>
</template>
