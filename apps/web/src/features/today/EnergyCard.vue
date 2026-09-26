<script setup lang="ts">
import type { DayScore, NutrientKey } from '@diet-tracker/shared'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import Card from '@/components/ui/Card.vue'
import Chip, { type ChipTone } from '@/components/ui/Chip.vue'
import Icon from '@/components/ui/Icon.vue'
import ProgressBar, { type BarColor } from '@/components/ui/ProgressBar.vue'
import Ring from '@/components/ui/Ring.vue'
import { STATUS_LABELS, formatNumber } from '@/lib/format'

/** The hero: remaining kcal inside the energy ring, with the macro bars beside it. */
const props = defineProps<{ score: DayScore }>()

interface Bar {
  key: NutrientKey
  label: string
  color: BarColor
}
const BARS: Bar[] = [
  { key: 'protein_g', label: 'Protein', color: 'protein' },
  { key: 'carbs_g', label: 'Carbs', color: 'carbs' },
  { key: 'fat_g', label: 'Fat', color: 'fat' },
  { key: 'fiber_g', label: 'Fibre', color: 'fibre' },
]

const energy = computed(() => props.score.scores.energy_kcal)
const eaten = computed(() => energy.value?.actual ?? 0)
const target = computed(() => energy.value?.target ?? 0)
const remaining = computed(() => Math.round(target.value - eaten.value))
const over = computed(() => energy.value?.status === 'over')
const ringColor = computed(() => (over.value ? 'var(--over)' : 'var(--accent)'))

const TONE: Record<string, ChipTone> = {
  met: 'met',
  close: 'close',
  short: 'short',
  over: 'over',
  unscored: 'neutral',
}
const actual = (key: NutrientKey) => props.score.scores[key]?.actual ?? 0
const goal = (key: NutrientKey) => props.score.scores[key]?.target ?? 0
</script>

<template>
  <Card>
    <div class="flex items-center justify-between">
      <span class="text-xs font-medium tracking-wide text-fg-muted uppercase">Energy</span>
      <RouterLink
        :to="{ name: 'targets' }"
        class="flex items-center gap-1 text-sm font-semibold text-accent"
      >
        Targets <Icon name="chevron-right" :size="16" />
      </RouterLink>
    </div>

    <div class="mt-2 flex items-center gap-3">
      <Ring
        :value="eaten"
        :max="target"
        :size="148"
        :stroke="12"
        :color="ringColor"
        :label="`Energy: ${formatNumber(Math.round(eaten), 0)} of ${formatNumber(target, 0)} kcal`"
        class="shrink-0"
      >
        <span
          class="text-[34px] leading-none font-bold text-fg"
          style="font-variant-numeric: proportional-nums"
        >
          {{ formatNumber(Math.abs(remaining), 0) }}
        </span>
        <span class="mt-1 text-xs text-fg-muted">{{ over ? 'kcal over' : 'kcal left' }}</span>
      </Ring>

      <!-- dt and dd sit directly in the group div (a11y "dlitem"); the grid keeps the row layout. -->
      <dl class="min-w-0 flex-1 space-y-2.5">
        <div
          v-for="bar in BARS"
          :key="bar.key"
          class="grid grid-cols-[auto_1fr] items-baseline gap-x-2 text-xs"
        >
          <dt class="font-medium text-fg">{{ bar.label }}</dt>
          <dd class="truncate text-right text-fg-muted">
            <span class="font-semibold text-fg">{{ formatNumber(actual(bar.key), 0) }}</span>
            / {{ formatNumber(goal(bar.key), 0) }} g
          </dd>
          <dd class="col-span-2 mt-1">
            <ProgressBar
              :value="actual(bar.key)"
              :max="goal(bar.key)"
              :color="bar.color"
              :label="bar.label"
            />
          </dd>
        </div>
      </dl>
    </div>

    <div class="mt-3 flex items-center justify-between gap-2">
      <p class="text-sm text-fg-muted">
        <span class="font-semibold text-fg">{{ formatNumber(Math.round(eaten), 0) }}</span>
        of {{ formatNumber(target, 0) }} kcal eaten
      </p>
      <Chip v-if="energy && score.logged" :tone="TONE[energy.status]">
        {{ STATUS_LABELS[energy.status] }}
      </Chip>
    </div>
  </Card>
</template>
