<script setup lang="ts">
import type { TargetChangeCard } from '@diet-tracker/shared'
import { computed, ref } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import { useSetOverrides } from '@/features/targets/useTargets'
import { ApiError } from '@/lib/api'
import { formatNumber, unitLabel } from '@/lib/format'
import CardFrame from './CardFrame.vue'

/**
 * Before and after for one target, the targets the engine recomputes from it, the floor
 * and any range warning. Apply pins it through `PATCH /targets/overrides`, the same call
 * the override sheet makes, so Targets then reads "Set by you".
 */
const props = defineProps<{ card: TargetChangeCard; pending?: boolean }>()
const emit = defineEmits<{ confirmed: []; dismiss: [] }>()

const overrides = useSetOverrides()
const error = ref<string | null>(null)
const unit = computed(() => unitLabel(props.card.unit, props.card.key))
const unpin = computed(() => props.card.value === null)

function confirm(): void {
  error.value = null
  overrides.mutate(
    { overrides: { [props.card.key]: props.card.value }, confirm: false },
    {
      onSuccess: () => emit('confirmed'),
      onError: (e: unknown) => {
        error.value = e instanceof ApiError ? e.message : 'Could not change the target.'
      },
    },
  )
}
</script>

<template>
  <CardFrame
    icon="target"
    :title="
      unpin ? `Clear your ${card.label.toLowerCase()} pin` : `Change ${card.label.toLowerCase()}`
    "
    :state="card.state"
    confirm-label="Apply"
    confirmed-label="Applied"
    :pending="pending"
    :saving="overrides.isPending.value"
    :error="error"
    @confirm="confirm"
    @dismiss="emit('dismiss')"
  >
    <div class="flex items-baseline justify-center gap-3 rounded-card bg-surface-2 px-3 py-3">
      <span
        class="text-xl font-semibold text-fg-muted tabular-nums line-through decoration-fg-muted/60"
      >
        {{ formatNumber(card.before) }}
      </span>
      <Icon name="chevron-right" :size="18" class="text-fg-muted" />
      <span class="text-3xl font-bold text-fg tabular-nums">{{ formatNumber(card.after) }}</span>
      <span class="text-sm text-fg-muted">{{ unit }}</span>
    </div>
    <p class="mt-2 text-sm text-fg-muted">
      <template v-if="unpin">Back to the engine's number.</template>
      <template v-else>
        Set by you. Recommended: {{ formatNumber(card.recommended) }} {{ unit }}.
      </template>
      <template v-if="card.reason"> {{ card.reason }}</template>
    </p>

    <ul v-if="card.dependants.length" class="mt-3 space-y-1 text-sm" aria-label="Also changes">
      <li v-for="d in card.dependants" :key="d.key" class="flex items-center justify-between gap-2">
        <span class="text-fg-muted">{{ d.label }}</span>
        <span class="tabular-nums text-fg">
          <span class="text-fg-muted">{{ formatNumber(d.before) }}</span>
          → {{ formatNumber(d.after) }} {{ unitLabel(d.unit, d.key) }}
        </span>
      </li>
    </ul>

    <p
      v-if="card.warning"
      class="mt-3 flex items-start gap-2 rounded-control border border-close/40 bg-close/10 px-3 py-2 text-sm text-fg"
      role="note"
    >
      <Icon name="alert" :size="16" class="mt-0.5 shrink-0 text-close" />
      {{ card.warning }}
    </p>
    <p v-else-if="card.floor !== null" class="mt-3 flex items-center gap-1.5 text-xs text-fg-muted">
      <Icon name="shield" :size="14" class="shrink-0" />
      Above the safe minimum of {{ formatNumber(card.floor) }} {{ unit }}.
    </p>
  </CardFrame>
</template>
