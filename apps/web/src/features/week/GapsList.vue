<script setup lang="ts">
import { MAX_GAPS_SHOWN, type Gap, type GapSeverity } from '@diet-tracker/shared'
import { computed } from 'vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Chip, { type ChipTone } from '@/components/ui/Chip.vue'
import Icon from '@/components/ui/Icon.vue'
import { useUiStore } from '@/stores/ui'

/** "Areas where you're lacking": the top gaps from the engine's rules, each with foods that fit. */
const props = defineProps<{ gaps: Gap[]; daysLogged: number }>()

const ui = useUiStore()

const TONE: Record<GapSeverity, ChipTone> = { high: 'over', medium: 'close', low: 'neutral' }
const SEVERITY_LABEL: Record<GapSeverity, string> = {
  high: 'Priority',
  medium: 'Worth fixing',
  low: 'Minor',
}

const notEnough = computed(() => props.gaps.find((g) => g.rule === 'not_enough_days') ?? null)
const shown = computed(() =>
  props.gaps.filter((g) => g.rule !== 'not_enough_days').slice(0, MAX_GAPS_SHOWN),
)
</script>

<template>
  <Card>
    <h2 class="flex items-center gap-2 text-base font-semibold">
      <Icon name="alert" :size="20" class="text-close" />
      Where you're lacking
    </h2>

    <div v-if="notEnough" class="mt-3">
      <p class="text-sm text-fg-muted">{{ notEnough.evidence }}</p>
      <Button class="mt-3" variant="secondary" @click="ui.openQuickAdd()">
        <Icon name="plus" :size="20" /> Log food
      </Button>
    </div>

    <p v-else-if="shown.length === 0" class="mt-3 text-sm text-fg-muted">
      Nothing stands out over {{ daysLogged }} logged days. Every rule passed.
    </p>

    <ol v-else class="mt-3 space-y-4">
      <li v-for="gap in shown" :key="`${gap.rule}:${gap.key ?? ''}`">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-sm font-semibold text-fg">{{ gap.title }}</h3>
          <Chip :tone="TONE[gap.severity]">{{ SEVERITY_LABEL[gap.severity] }}</Chip>
        </div>
        <p class="mt-1 text-sm text-fg-muted">{{ gap.evidence }}</p>
        <ul v-if="gap.suggestions.length" class="mt-2 space-y-1">
          <li
            v-for="suggestion in gap.suggestions"
            :key="suggestion"
            class="flex gap-2 text-sm text-fg"
          >
            <Icon name="check" :size="16" class="mt-0.5 shrink-0 text-accent" />
            {{ suggestion }}
          </li>
        </ul>
      </li>
    </ol>
  </Card>
</template>
