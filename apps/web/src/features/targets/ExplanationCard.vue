<script setup lang="ts">
import type { StoredPlanExplanation } from '@diet-tracker/shared'
import { ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Skeleton from '@/components/ui/Skeleton.vue'

defineProps<{
  explanation: StoredPlanExplanation | null
  loading: boolean
  error: string | null
}>()

const emit = defineEmits<{ retry: []; regenerate: [] }>()
const expanded = ref(false)
</script>

<template>
  <Card>
    <div class="flex items-center justify-between gap-2">
      <h2 class="flex items-center gap-2 text-base font-semibold">
        <Icon name="sparkles" :size="20" class="text-accent" />
        Your plan, explained
      </h2>
      <IconButton
        v-if="explanation && !loading"
        label="Write it again"
        icon="refresh"
        @click="emit('regenerate')"
      />
    </div>

    <div v-if="loading" class="mt-3 space-y-2" aria-busy="true">
      <Skeleton class="h-5 w-4/5" />
      <Skeleton class="h-4 w-full" />
      <Skeleton class="h-4 w-full" />
      <Skeleton class="h-4 w-2/3" />
      <p class="pt-1 text-xs text-fg-muted">Reading your numbers…</p>
    </div>

    <div v-else-if="explanation" class="mt-3 space-y-3">
      <p class="text-base font-semibold text-fg">{{ explanation.headline }}</p>
      <p
        v-for="(paragraph, i) in expanded
          ? explanation.paragraphs
          : explanation.paragraphs.slice(0, 1)"
        :key="i"
        class="text-sm leading-relaxed text-fg-muted"
      >
        {{ paragraph }}
      </p>
      <template v-if="expanded">
        <div v-if="explanation.key_habits.length">
          <h3 class="text-sm font-semibold text-fg">Three habits that hit these numbers</h3>
          <ul class="mt-1.5 space-y-1.5">
            <li
              v-for="habit in explanation.key_habits"
              :key="habit"
              class="flex gap-2 text-sm text-fg-muted"
            >
              <Icon name="check" :size="16" class="mt-0.5 shrink-0 text-accent" />
              {{ habit }}
            </li>
          </ul>
        </div>
        <ul v-if="explanation.caveats.length" class="space-y-1">
          <li
            v-for="caveat in explanation.caveats"
            :key="caveat"
            class="flex gap-2 text-sm text-fg-muted"
          >
            <Icon name="info" :size="16" class="mt-0.5 shrink-0" />
            {{ caveat }}
          </li>
        </ul>
        <p class="text-xs text-fg-muted">
          Written by AI ({{ explanation.model }}) from the numbers below. It explains the targets;
          it never sets them.
        </p>
      </template>
      <button
        type="button"
        class="text-sm font-semibold text-accent"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        {{ expanded ? 'Show less' : 'Read more' }}
      </button>
    </div>

    <div v-else class="mt-3">
      <p class="text-sm text-fg-muted">
        {{ error ?? 'No explanation yet.' }}
      </p>
      <Button class="mt-3" variant="secondary" @click="emit('retry')">Try again</Button>
    </div>
  </Card>
</template>
