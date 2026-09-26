<script setup lang="ts">
import {
  MEAL_LABELS,
  contributionsTo,
  suggestionsFor,
  type LogEntry,
  type TargetScore,
} from '@diet-tracker/shared'
import { computed } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import { useProfile } from '@/features/profile/useProfile'
import { formatNumber, formatQuantity } from '@/lib/format'

/**
 * What sits behind one food-group row or nutrient tile on Today: how far the day is from
 * the target, the entries that supplied it (largest first, with their share of the day),
 * and, when the day is short of a minimum or near a limit, food ideas that fit the
 * person's diet pattern, allergies and dislikes (the same lists as the weekly gaps).
 */
const props = defineProps<{
  id: string
  score: TargetScore
  entries: LogEntry[]
  /** The short unit the tile shows: "mg", "mcg", "g", "drinks" or "serves". */
  unit: string
  isToday: boolean
}>()

const { profile } = useProfile()

const breakdown = computed(() => contributionsTo(props.entries, props.score.key))

function amount(value: number): string {
  if (value > 0 && value < 0.05) return '<0.1'
  return formatNumber(value >= 100 ? Math.round(value) : Math.round(value * 10) / 10, 1)
}

function withUnit(value: number): string {
  const text = amount(value)
  return props.unit === 'serves' && text === '1' ? '1 serve' : `${text} ${props.unit}`
}

function percent(share: number): string {
  const rounded = Math.round(share * 100)
  return rounded === 0 && share > 0 ? '<1%' : `${rounded}%`
}

/** One line on where the day stands against the target, in the target's own unit. */
const standing = computed(() => {
  const { kind, actual, target, status } = props.score
  if (target <= 0) return null
  if (kind === 'minimum') {
    return status === 'met' ? 'Target met' : `${withUnit(target - actual)} to go`
  }
  if (kind === 'limit') {
    return actual > target
      ? `${withUnit(actual - target)} over the limit`
      : `${withUnit(target - actual)} under the limit`
  }
  return null
})

const ideas = computed(() => {
  const { kind, status, key } = props.score
  const short = kind === 'minimum' && (status === 'short' || status === 'close')
  const high = kind === 'limit' && (status === 'close' || status === 'over')
  if (!profile.value || (!short && !high)) return null
  const items = suggestionsFor(key, profile.value)
  return items.length ? { heading: short ? 'Good sources' : 'Ways to cut back', items } : null
})
</script>

<template>
  <div :id="id" class="rounded-control bg-surface-2 px-3 py-3 text-sm">
    <p v-if="standing" class="font-semibold text-fg">{{ standing }}</p>

    <p
      class="text-xs font-medium tracking-wide text-fg-muted uppercase"
      :class="standing && 'mt-2'"
    >
      Where it came from
    </p>
    <ul v-if="breakdown.top.length" class="mt-1 divide-y divide-border">
      <li v-for="item in breakdown.top" :key="item.entry.id" class="flex items-center gap-2 py-1.5">
        <span class="min-w-0 flex-1">
          <span class="block truncate text-fg">{{ item.entry.name }}</span>
          <span class="block truncate text-xs text-fg-muted">
            {{ formatQuantity(item.entry.quantity, item.entry.unit) }} ·
            {{ MEAL_LABELS[item.entry.meal] }}
          </span>
        </span>
        <span class="shrink-0 font-semibold text-fg">{{ withUnit(item.amount) }}</span>
        <span class="w-9 shrink-0 text-right text-xs text-fg-muted">{{ percent(item.share) }}</span>
      </li>
      <li v-if="breakdown.rest" class="flex items-center gap-2 py-1.5 text-fg-muted">
        <span class="min-w-0 flex-1 truncate">
          {{ breakdown.rest.count }} more {{ breakdown.rest.count === 1 ? 'item' : 'items' }}
        </span>
        <span class="shrink-0">{{ withUnit(breakdown.rest.amount) }}</span>
        <span class="w-9 shrink-0 text-right text-xs">{{ percent(breakdown.rest.share) }}</span>
      </li>
    </ul>
    <p v-else class="mt-1 text-fg-muted">
      Nothing logged {{ isToday ? 'today' : 'this day' }} has any.
    </p>

    <template v-if="ideas">
      <p class="mt-3 text-xs font-medium tracking-wide text-fg-muted uppercase">
        {{ ideas.heading }}
      </p>
      <ul class="mt-1 space-y-1">
        <li v-for="idea in ideas.items" :key="idea" class="flex gap-2 text-fg">
          <Icon name="leaf" :size="16" class="mt-0.5 shrink-0 text-fibre" />
          {{ idea }}
        </li>
      </ul>
    </template>
  </div>
</template>
