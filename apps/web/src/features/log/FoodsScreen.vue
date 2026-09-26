<script setup lang="ts">
import type { Food, LogEntryInput, Meal } from '@diet-tracker/shared'
import { computed, reactive, ref, watch } from 'vue'
import AppShell from '@/components/ui/AppShell.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Sheet from '@/components/ui/Sheet.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { ApiError } from '@/lib/api'
import { formatInstant, formatKcal } from '@/lib/format'
import { useUiStore } from '@/stores/ui'
import ManualFoodForm from './ManualFoodForm.vue'
import PortionPicker from './PortionPicker.vue'
import { basisLabel, emptyFoodForm, parseFoodForm } from './food-form'
import { useCreateEntries, useCreateFood, useDeleteFood, useFoods, useUpdateFood } from './useLog'
import { useLocalDay } from './useLocalDay'

/** My foods: search, one-tap re-log with a portion, edit, delete, and add a new one. */
const ui = useUiStore()
const { today, suggestion } = useLocalDay()
const q = ref('')
const foods = useFoods(q)
const createFood = useCreateFood()
const updateFood = useUpdateFood()
const deleteFood = useDeleteFood()
const createEntries = useCreateEntries()

const selected = ref<Food | null>(null)
const creating = ref(false)
const tab = ref<'log' | 'edit'>('log')
const TABS = [
  { value: 'log', label: 'Log it' },
  { value: 'edit', label: 'Edit' },
]
const tabValue = computed({
  get: () => tab.value,
  set: (value: string) => {
    if (value === 'log' || value === 'edit') tab.value = value
  },
})

const sheetOpen = computed({
  get: () => selected.value !== null || creating.value,
  set: (open: boolean) => {
    if (!open) {
      selected.value = null
      creating.value = false
    }
  },
})

const form = reactive(emptyFoodForm())
const fieldErrors = ref<Record<string, string[]>>({})
const error = ref<string | null>(null)
const confirmingDelete = ref(false)

watch([selected, creating], ([food, isCreating]) => {
  Object.assign(form, emptyFoodForm(isCreating ? null : food))
  fieldErrors.value = {}
  error.value = null
  confirmingDelete.value = false
  tab.value = 'log'
  createFood.reset()
  updateFood.reset()
  deleteFood.reset()
  createEntries.reset()
})

function saveFood(): void {
  const parsed = parseFoodForm(form)
  if (!parsed.ok) {
    fieldErrors.value = parsed.fieldErrors
    return
  }
  fieldErrors.value = {}
  error.value = null
  const onError = (e: unknown) => {
    error.value = e instanceof ApiError ? e.message : 'Could not save. Please try again.'
  }
  if (creating.value) {
    createFood.mutate(parsed.data, {
      onSuccess: () => {
        ui.toast('Added to My foods', 'success')
        sheetOpen.value = false
      },
      onError,
    })
  } else if (selected.value) {
    updateFood.mutate(
      { id: selected.value.id, input: parsed.data },
      {
        onSuccess: () => {
          ui.toast('Food updated', 'success')
          sheetOpen.value = false
        },
        onError,
      },
    )
  }
}

function removeFood(): void {
  if (!selected.value) return
  if (!confirmingDelete.value) {
    confirmingDelete.value = true
    return
  }
  deleteFood.mutate(selected.value.id, {
    onSuccess: () => {
      ui.toast('Removed from My foods. Logged entries keep their numbers.', 'success')
      sheetOpen.value = false
    },
    onError: (e: unknown) => {
      error.value = e instanceof ApiError ? e.message : 'Could not delete. Please try again.'
    },
  })
}

function logPortion(payload: { day: string; meal: Meal; entry: LogEntryInput }): void {
  error.value = null
  createEntries.mutate(
    {
      day: payload.day,
      meal: payload.meal,
      loggedAt: new Date().toISOString(),
      entries: [payload.entry],
    },
    {
      onSuccess: () => {
        ui.toast(
          `Added to ${payload.meal} · ${formatKcal(payload.entry.nutrients.energy_kcal)}`,
          'success',
        )
        sheetOpen.value = false
      },
      onError: (e: unknown) => {
        error.value = e instanceof ApiError ? e.message : 'Could not save. Please try again.'
      },
    },
  )
}
</script>

<template>
  <AppShell title="My foods" :back="{ name: 'you' }">
    <template #header-right>
      <IconButton label="Add a food" icon="plus" @click="creating = true" />
    </template>

    <div class="space-y-4">
      <div class="relative">
        <span class="pointer-events-none absolute inset-y-0 left-4 flex items-center text-fg-muted">
          <Icon name="search" :size="18" />
        </span>
        <input
          v-model="q"
          type="search"
          placeholder="Search"
          aria-label="Search my foods"
          autocomplete="off"
          enterkeyhint="search"
          class="h-12 w-full rounded-control border border-border bg-surface-2 pr-4 pl-11 text-base text-fg placeholder:text-fg-muted/70 transition outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      </div>

      <div v-if="foods.isLoading.value" class="space-y-2" aria-busy="true">
        <Skeleton v-for="i in 5" :key="i" class="h-16 w-full" rounded="card" />
      </div>

      <Card v-else-if="foods.isError.value">
        <p class="text-sm text-fg-muted">
          {{ foods.error.value?.message ?? 'Could not load your foods.' }}
        </p>
        <Button class="mt-3" variant="secondary" @click="foods.refetch()">Try again</Button>
      </Card>

      <Card v-else-if="foods.foods.value.length === 0" :padded="false">
        <EmptyState
          icon="book"
          :title="q ? 'No matches' : 'No saved foods yet'"
          :description="
            q
              ? 'Try another word.'
              : 'Foods you enter by hand, and AI estimates you save, appear here for one-tap logging.'
          "
        >
          <Button v-if="!q" @click="creating = true"
            ><Icon name="plus" :size="20" /> Add a food</Button
          >
        </EmptyState>
      </Card>

      <Card v-else :padded="false">
        <ul class="divide-y divide-border" aria-label="My foods">
          <li v-for="food in foods.foods.value" :key="food.id">
            <button
              type="button"
              class="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2 active:bg-border/40"
              @click="selected = food"
            >
              <span
                class="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-muted"
                aria-hidden="true"
              >
                <Icon :name="food.source === 'ai' ? 'sparkles' : 'pencil'" :size="16" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-base text-fg">
                  {{ food.name
                  }}<span v-if="food.brand" class="text-fg-muted"> · {{ food.brand }}</span>
                </span>
                <span class="block text-xs text-fg-muted">
                  {{ formatKcal(food.nutrients.energy_kcal) }} {{ basisLabel(food) }}
                  <template v-if="food.lastUsedAt">
                    · used {{ formatInstant(food.lastUsedAt) }}</template
                  >
                </span>
              </span>
              <Icon name="chevron-right" :size="18" class="shrink-0 text-fg-muted" />
            </button>
          </li>
        </ul>
      </Card>
    </div>

    <Sheet v-model:open="sheetOpen" :title="creating ? 'New food' : (selected?.name ?? '')">
      <div class="space-y-4">
        <template v-if="creating">
          <ManualFoodForm v-model="form" :field-errors="fieldErrors" />
          <p v-if="error" class="text-sm text-over" role="alert">{{ error }}</p>
          <Button
            block
            :loading="createFood.isPending.value"
            :disabled="!ui.online"
            @click="saveFood"
          >
            {{ ui.online ? 'Save to My foods' : 'Offline' }}
          </Button>
        </template>

        <template v-else-if="selected">
          <SegmentedControl v-model="tabValue" label="Action" :options="TABS" />
          <PortionPicker
            v-if="tab === 'log'"
            :food="selected"
            :today="today"
            :previous-day="suggestion.previousDay"
            :initial-day="suggestion.day"
            :initial-meal="suggestion.meal"
            :saving="createEntries.isPending.value"
            :error="error"
            @back="sheetOpen = false"
            @confirm="logPortion"
          />
          <template v-else>
            <ManualFoodForm v-model="form" :field-errors="fieldErrors" />
            <p v-if="error" class="text-sm text-over" role="alert">{{ error }}</p>
            <div class="space-y-2">
              <Button
                block
                :loading="updateFood.isPending.value"
                :disabled="!ui.online"
                @click="saveFood"
              >
                {{ ui.online ? 'Save changes' : 'Offline' }}
              </Button>
              <Button
                block
                variant="destructive"
                :loading="deleteFood.isPending.value"
                :disabled="!ui.online"
                @click="removeFood"
              >
                <Icon name="trash" :size="18" />
                {{ confirmingDelete ? 'Tap again to delete' : 'Delete from My foods' }}
              </Button>
            </div>
          </template>
        </template>
      </div>
    </Sheet>
  </AppShell>
</template>
