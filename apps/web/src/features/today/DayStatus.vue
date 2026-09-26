<script setup lang="ts">
import type { DayScore } from '@diet-tracker/shared'
import { computed } from 'vue'
import Chip from '@/components/ui/Chip.vue'
import Icon from '@/components/ui/Icon.vue'
import { targetLabel } from '@/lib/format'

/** One line under the greeting: is the day met, and if not, what is in the way. */
const props = defineProps<{ score: DayScore; isToday: boolean }>()

const reasons = computed(() => {
  const s = props.score.scores
  const out: string[] = []
  const energy = s.energy_kcal
  if (energy && energy.status !== 'met' && energy.status !== 'close') {
    out.push(`energy ${energy.status}`)
  }
  const protein = s.protein_g
  if (protein && protein.status !== 'met') out.push(`protein ${protein.status}`)
  for (const score of Object.values(s)) {
    if (score.kind === 'limit' && score.status === 'over') {
      out.push(`${targetLabel(score.key).toLowerCase()} over`)
    }
  }
  return out
})
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <template v-if="!score.logged">
      <Chip tone="neutral">{{ isToday ? 'Nothing much logged yet' : 'Not logged' }}</Chip>
      <span class="text-xs text-fg-muted">
        A day scores once it has two entries or 40% of the energy target.
      </span>
    </template>
    <template v-else-if="score.dayMet">
      <Chip tone="met"><Icon name="check" :size="16" /> Day met</Chip>
      <span class="text-xs text-fg-muted">Energy in band, protein hit, no limit over.</span>
    </template>
    <template v-else>
      <Chip tone="close">{{ isToday ? 'Not met yet' : 'Not met' }}</Chip>
      <span v-if="reasons.length" class="text-xs text-fg-muted">
        {{ reasons.join(', ') }}
      </span>
    </template>
  </div>
</template>
