<script setup lang="ts">
import {
  MAX_WEIGHT_NOTE_CHARS,
  addDays,
  toValidationDetails,
  upsertWeightRequestSchema,
  type WeightEntry,
} from '@diet-tracker/shared'
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Sheet from '@/components/ui/Sheet.vue'
import WeightField from '@/features/profile/WeightField.vue'
import { useProfile } from '@/features/profile/useProfile'
import { ApiError } from '@/lib/api'
import { formatDay } from '@/lib/format'
import { useUiStore } from '@/stores/ui'
import { useUpsertWeight } from './useProgress'

/** Log (or correct) a weigh-in: weight in the person's units, the day, an optional note. */
const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  today: string
  /** The most recent weigh-in, used as the starting value. */
  latest: WeightEntry | null
  /** Preset day, for correcting an older entry. */
  day?: string | null
}>()

const ui = useUiStore()
const profile = useProfile()
const upsert = useUpsertWeight()

const units = computed(() => profile.profile.value?.units ?? 'metric')
const weightKg = ref<number | null>(null)
const day = ref(props.today)
const note = ref('')
const fieldErrors = ref<Record<string, string[]>>({})
const formError = ref<string | null>(null)

const yesterday = computed(() => addDays(props.today, -1))
const dayLabel = computed(() =>
  day.value === props.today
    ? 'Today'
    : day.value === yesterday.value
      ? 'Yesterday'
      : formatDay(day.value),
)

watch(open, (isOpen) => {
  if (!isOpen) return
  weightKg.value = props.latest?.weightKg ?? profile.profile.value?.weightKg ?? null
  day.value = props.day ?? props.today
  note.value = ''
  fieldErrors.value = {}
  formError.value = null
  upsert.reset()
})

function submit(): void {
  fieldErrors.value = {}
  formError.value = null
  const parsed = upsertWeightRequestSchema.safeParse({
    day: day.value,
    weightKg: weightKg.value,
    note: note.value.trim() || null,
  })
  if (!parsed.success) {
    fieldErrors.value = toValidationDetails(parsed.error).fieldErrors
    return
  }
  upsert.mutate(parsed.data, {
    onSuccess: (result) => {
      ui.toast(
        result.profileWeightUpdated
          ? `Weight saved for ${dayLabel.value.toLowerCase()}. Your profile shows it too.`
          : `Weight saved for ${dayLabel.value.toLowerCase()}.`,
        'success',
      )
      open.value = false
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError) {
        fieldErrors.value = error.fieldErrors
        formError.value = Object.keys(error.fieldErrors).length ? null : error.message
      } else {
        formError.value = 'Could not save. Please try again.'
      }
    },
  })
}
</script>

<template>
  <Sheet
    v-model:open="open"
    title="Log weight"
    description="Weigh in at the same time of day, ideally in the morning. Day-to-day swings are normal; the trend is what counts."
  >
    <form class="space-y-4" novalidate @submit.prevent="submit">
      <WeightField
        v-model="weightKg"
        :units="units"
        label="Weight"
        :error="fieldErrors.weightKg?.[0] ?? null"
      />
      <div class="space-y-1.5">
        <label for="weight-day" class="block text-sm font-medium text-fg-muted">Day</label>
        <div class="flex gap-2">
          <button
            type="button"
            class="h-11 rounded-full border px-4 text-sm font-medium transition"
            :class="
              day === today
                ? 'border-accent bg-accent/15 text-fg'
                : 'border-border bg-surface-2 text-fg-muted'
            "
            @click="day = today"
          >
            Today
          </button>
          <button
            type="button"
            class="h-11 rounded-full border px-4 text-sm font-medium transition"
            :class="
              day === yesterday
                ? 'border-accent bg-accent/15 text-fg'
                : 'border-border bg-surface-2 text-fg-muted'
            "
            @click="day = yesterday"
          >
            Yesterday
          </button>
        </div>
        <input
          id="weight-day"
          v-model="day"
          type="date"
          :max="today"
          class="h-12 w-full rounded-control border border-border bg-surface-2 px-4 text-base text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        <p v-if="fieldErrors.day?.[0]" class="text-sm text-over" role="alert">
          {{ fieldErrors.day[0] }}
        </p>
      </div>
      <Input
        v-model="note"
        label="Note (optional)"
        placeholder="After a long run, holiday, new scale…"
        :error="fieldErrors.note?.[0] ?? null"
        :helper="`${note.length}/${MAX_WEIGHT_NOTE_CHARS}`"
      />
      <p v-if="formError" class="text-sm text-over" role="alert">{{ formError }}</p>
      <Button type="submit" block :loading="upsert.isPending.value" :disabled="!ui.online">
        {{ ui.online ? 'Save weight' : 'Offline' }}
      </Button>
    </form>
  </Sheet>
</template>
