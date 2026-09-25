<script setup lang="ts">
import { checkOverride, type TargetEntry } from '@diet-tracker/shared'
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import NumberField from '@/components/ui/NumberField.vue'
import Sheet from '@/components/ui/Sheet.vue'
import { KIND_LABELS, formatNumber, targetLabel, unitLabel } from '@/lib/format'
import { useUiStore } from '@/stores/ui'

/**
 * Change one target. Inside the usual range saves quietly; outside it saves with a
 * warning; below the safety floor needs a second, explicit tap.
 */
const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  /** The target as currently in force (may already be overridden). */
  entry: TargetEntry | null
  /** The engine's recommendation with no overrides, used for range and floor checks. */
  recommended: TargetEntry | null
  saving: boolean
  /** Server-side refusal message, shown when the API blocked the value. */
  serverError: string | null
}>()

const emit = defineEmits<{
  save: [value: number, confirm: boolean]
  reset: []
}>()

const ui = useUiStore()
const value = ref<number | null>(null)
const confirming = ref(false)

watch(
  () => [open.value, props.entry] as const,
  ([isOpen, entry]) => {
    if (isOpen && entry) {
      value.value = entry.value
      confirming.value = false
    }
  },
  { immediate: true },
)

const unit = computed(() => (props.entry ? unitLabel(props.entry.unit, props.entry.key) : ''))
const step = computed(() => {
  if (!props.entry) return 1
  if (props.entry.key === 'energy_kcal') return 10
  if (props.entry.unit === 'g' && ['protein_g', 'carbs_g', 'fat_g'].includes(props.entry.key))
    return 5
  if (props.entry.unit === 'ml') return 250
  if (props.entry.unit === 'mg' && props.entry.value >= 500) return 50
  if (props.entry.unit === 'ug' && props.entry.value >= 100) return 50
  if (props.entry.unit === 'serves' || props.entry.value < 20) return 0.5
  return 1
})

const check = computed(() =>
  props.recommended && value.value !== null ? checkOverride(props.recommended, value.value) : null,
)
const changed = computed(() => props.entry !== null && value.value !== props.entry.value)
const isRecommended = computed(
  () => props.recommended !== null && value.value === props.recommended.value,
)

const rangeText = computed(() => {
  const range = props.recommended?.range
  if (!range) return null
  return `Usual range ${formatNumber(range.min)} to ${formatNumber(range.max)} ${unit.value}`
})

function save(): void {
  if (value.value === null || !props.entry) return
  if (check.value?.level === 'blocked' && !confirming.value) {
    confirming.value = true
    return
  }
  emit('save', value.value, confirming.value)
}
</script>

<template>
  <Sheet
    v-model:open="open"
    :title="entry ? targetLabel(entry.key) : ''"
    :description="entry ? KIND_LABELS[entry.kind] : undefined"
  >
    <div v-if="entry && recommended" class="space-y-4">
      <p class="text-sm text-fg-muted">
        <span class="font-medium text-fg">
          Recommended: {{ formatNumber(recommended.value) }} {{ unit }}.
        </span>
        {{ recommended.reason }}
      </p>

      <NumberField
        v-model="value"
        :label="`Your target`"
        :unit="unit"
        :min="0"
        :step="step"
        :helper="rangeText ?? undefined"
      />

      <p
        v-if="check && check.level !== 'ok'"
        class="flex items-start gap-2 rounded-control border px-3 py-2.5 text-sm"
        :class="
          check.level === 'blocked'
            ? 'border-over/40 bg-over/10 text-fg'
            : 'border-close/40 bg-close/10 text-fg'
        "
        role="alert"
      >
        <Icon
          name="alert"
          :size="18"
          class="mt-0.5 shrink-0"
          :class="check.level === 'blocked' ? 'text-over' : 'text-close'"
        />
        <span>
          {{ check.message }}
          <template v-if="check.level === 'blocked' && confirming">
            Tap “Save anyway” to confirm.
          </template>
        </span>
      </p>
      <p
        v-else-if="serverError"
        class="flex items-start gap-2 rounded-control border border-over/40 bg-over/10 px-3 py-2.5 text-sm text-fg"
        role="alert"
      >
        <Icon name="alert" :size="18" class="mt-0.5 shrink-0 text-over" />
        {{ serverError }}
      </p>

      <div class="space-y-2">
        <Button
          block
          :variant="check?.level === 'blocked' && confirming ? 'destructive' : 'primary'"
          :disabled="!changed || value === null || !ui.online"
          :loading="saving"
          @click="save"
        >
          <template v-if="!ui.online">Offline</template>
          <template v-else-if="check?.level === 'blocked' && confirming">Save anyway</template>
          <template v-else>Save</template>
        </Button>
        <Button
          v-if="entry.overridden && !isRecommended"
          block
          variant="ghost"
          :disabled="saving || !ui.online"
          @click="emit('reset')"
        >
          Use recommended ({{ formatNumber(recommended.value) }} {{ unit }})
        </Button>
      </div>
    </div>
  </Sheet>
</template>
