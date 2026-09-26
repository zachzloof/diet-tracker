<script setup lang="ts">
import {
  WATER_QUICK_ADD_ML,
  isWaterEntry,
  waterEntryInput,
  type DayScore,
  type LogEntry,
} from '@diet-tracker/shared'
import { computed } from 'vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import { useCreateEntries, useDeleteEntry } from '@/features/log/useLog'
import { useLocalDay } from '@/features/log/useLocalDay'
import { formatNumber } from '@/lib/format'
import { useUiStore } from '@/stores/ui'

/**
 * Water for the day with a one-tap +250 ml (decision D18: a water quick-add is a log entry
 * whose only nutrient is water). "Undo" removes the most recent glass.
 */
const props = defineProps<{ score: DayScore; entries: LogEntry[]; day: string }>()

const ui = useUiStore()
const { suggestion } = useLocalDay()
const create = useCreateEntries()
const remove = useDeleteEntry()

const water = computed(() => props.score.scores.water_ml)
const actual = computed(() => water.value?.actual ?? 0)
const target = computed(() => water.value?.target ?? 0)
const glasses = computed(() => props.entries.filter(isWaterEntry))
const lastGlass = computed(() => glasses.value[glasses.value.length - 1] ?? null)
const busy = computed(() => create.isPending.value || remove.isPending.value)

function add(): void {
  create.mutate(
    {
      day: props.day,
      meal: suggestion.value.meal,
      loggedAt: new Date().toISOString(),
      entries: [waterEntryInput(WATER_QUICK_ADD_ML)],
    },
    { onError: (error) => ui.toast(error.message, 'error') },
  )
}

function undo(): void {
  if (!lastGlass.value) return
  remove.mutate(lastGlass.value.id, { onError: (error) => ui.toast(error.message, 'error') })
}
</script>

<template>
  <Card>
    <div class="flex items-center justify-between gap-2">
      <h2 class="flex items-center gap-2 text-base font-semibold">
        <Icon name="droplet" :size="20" class="text-water" />
        Water
      </h2>
      <StatusDot v-if="water" :status="water.status" label />
    </div>
    <div class="mt-2 flex items-baseline gap-1">
      <span class="text-[28px] leading-none font-bold text-fg">{{
        formatNumber(Math.round(actual), 0)
      }}</span>
      <span class="text-sm text-fg-muted">/ {{ formatNumber(target, 0) }} ml</span>
    </div>
    <ProgressBar class="mt-3" :value="actual" :max="target" color="water" label="Water" />
    <div class="mt-3 flex items-center gap-2">
      <Button class="flex-1" :loading="create.isPending.value" :disabled="busy" @click="add">
        <Icon name="plus" :size="20" /> {{ WATER_QUICK_ADD_ML }} ml
      </Button>
      <IconButton
        label="Undo last glass"
        icon="minus"
        :disabled="!lastGlass || busy"
        class="border border-border"
        @click="undo"
      />
    </div>
    <p class="mt-2 text-xs text-fg-muted">
      {{
        glasses.length === 0
          ? 'Tap +250 ml each time you finish a glass. Food and drinks count too.'
          : `${glasses.length} ${glasses.length === 1 ? 'glass' : 'glasses'} logged, ${formatNumber(
              glasses.reduce((sum, g) => sum + g.nutrients.water_ml, 0),
              0,
            )} ml; the rest comes from food and drinks.`
      }}
    </p>
  </Card>
</template>
