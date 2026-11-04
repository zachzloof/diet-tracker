<script setup lang="ts">
import { MEALS, MEAL_LABELS, type Meal } from '@diet-tracker/shared'
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Sheet from '@/components/ui/Sheet.vue'
import { ApiError } from '@/lib/api'
import { formatKcal } from '@/lib/format'
import { useUiStore } from '@/stores/ui'
import { rowKcal, rowName, type DayLogRow } from './day-groups'
import { useUpdateEntry, useUpdateGroup } from './useLog'

/**
 * The tick on a planned row (D43). A plan has no meal of the day until it is eaten, so this
 * asks which meal it was, every time, and one tap saves it. It stays on the plan's day. The row
 * stays set while the sheet slides away, so its words do not blank mid-animation.
 */
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ row: DayLogRow | null }>()

const ui = useUiStore()
const updateEntry = useUpdateEntry()
const updateGroup = useUpdateGroup()

const saving = ref<Meal | null>(null)
const description = computed(() =>
  props.row ? `${rowName(props.row)} · ${formatKcal(rowKcal(props.row))}` : '',
)

async function eat(meal: Meal): Promise<void> {
  const row = props.row
  if (!row || saving.value) return
  saving.value = meal
  const patch = { planned: false, meal }
  try {
    if (row.kind === 'group') await updateGroup.mutateAsync({ groupId: row.groupId, patch })
    else await updateEntry.mutateAsync({ id: row.entry.id, patch })
    ui.toast(`Added to ${MEAL_LABELS[meal].toLowerCase()} · ${formatKcal(rowKcal(row))}`, 'success')
    open.value = false
  } catch (error) {
    ui.toast(error instanceof ApiError ? error.message : 'Could not save. Try again.', 'error')
  } finally {
    saving.value = null
  }
}
</script>

<template>
  <Sheet v-model:open="open" title="Which meal was it?" :description="description">
    <div class="grid grid-cols-2 gap-2">
      <Button
        v-for="meal in MEALS"
        :key="meal"
        variant="secondary"
        :loading="saving === meal"
        :disabled="saving !== null || !ui.online"
        @click="eat(meal)"
      >
        {{ MEAL_LABELS[meal] }}
      </Button>
    </div>
  </Sheet>
</template>
