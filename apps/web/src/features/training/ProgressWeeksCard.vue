<script setup lang="ts">
import { weekStart, type WeekTotals } from '@diet-tracker/shared'
import { computed, ref } from 'vue'
import BarChart from '@/components/ui/BarChart.vue'
import Card from '@/components/ui/Card.vue'
import Icon from '@/components/ui/Icon.vue'
import SegmentedControl, { type SegmentOption } from '@/components/ui/SegmentedControl.vue'
import { formatDayShort, formatNumber } from '@/lib/format'
import { formatTonnage } from './draft'

/**
 * Week by week over the range (`weeklyTotals`): one measure at a time, picked under the
 * heading, as columns with the weekly average as a hairline. One axis per chart, so kg and
 * sessions are never drawn together. This week is the highlighted column.
 */
const props = defineProps<{ weeks: WeekTotals[]; today: string }>()

type Measure = 'volume' | 'sessions' | 'sets'
const MEASURES: SegmentOption[] = [
  { value: 'volume', label: 'Lifted' },
  { value: 'sessions', label: 'Sessions' },
  { value: 'sets', label: 'Sets' },
]
const measure = ref<string>('volume')
const picked = computed<Measure>(() =>
  measure.value === 'sessions' ? 'sessions' : measure.value === 'sets' ? 'sets' : 'volume',
)

const values = computed(() =>
  props.weeks.map((week) =>
    picked.value === 'volume'
      ? week.volumeKg
      : picked.value === 'sessions'
        ? week.sessions
        : week.workingSets,
  ),
)
const labels = computed(() => props.weeks.map((week) => formatDayShort(week.weekStart)))
const average = computed(() =>
  values.value.length ? values.value.reduce((sum, v) => sum + v, 0) / values.value.length : 0,
)
const thisWeek = computed(() => {
  const i = props.weeks.findIndex((week) => week.weekStart === weekStart(props.today))
  return i >= 0 ? i : null
})
const labelEvery = computed(() => Math.max(1, Math.ceil(props.weeks.length / 5)))

function format(value: number): string {
  if (picked.value === 'volume') return formatTonnage(value)
  const rounded = formatNumber(Math.round(value * 10) / 10, 1)
  if (picked.value === 'sessions') return `${rounded} ${value === 1 ? 'session' : 'sessions'}`
  return `${rounded} ${value === 1 ? 'set' : 'sets'}`
}

const NOTES: Readonly<Record<Measure, string>> = {
  volume: 'Weight × reps across the week’s working sets, bodyweight included',
  sessions: 'Finished sessions each week',
  sets: 'Working sets each week',
}
</script>

<template>
  <Card>
    <h2 class="flex items-center gap-2 text-base font-semibold">
      <Icon name="calendar" :size="20" class="text-accent" />
      Week by week
    </h2>
    <SegmentedControl v-model="measure" class="mt-3" label="Weekly measure" :options="MEASURES" />
    <p class="mt-2 text-xs text-fg-muted">{{ NOTES[picked] }}, weeks starting Monday.</p>
    <BarChart
      class="mt-2"
      :values="values"
      :labels="labels"
      :label="`${NOTES[picked]}, ${weeks.length} weeks`"
      :format="format"
      :highlight="thisWeek"
      :reference="average"
      reference-label="avg"
      :label-every="labelEvery"
      empty-label="nothing logged"
    />
  </Card>
</template>
