<script setup lang="ts">
import {
  FOOD_GROUP_KEYS,
  MICRO_KEYS,
  PACE_LABELS,
  targetFor,
  type TargetEntry,
  type TargetKey,
} from '@diet-tracker/shared'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/ui/AppShell.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { ApiError } from '@/lib/api'
import { formatDay, formatNumber } from '@/lib/format'
import { useUiStore } from '@/stores/ui'
import ExplanationCard from './ExplanationCard.vue'
import OverrideSheet from './OverrideSheet.vue'
import TargetRow from './TargetRow.vue'
import { useExplainPlan, useSetOverrides, useTargets } from './useTargets'

const route = useRoute()
const router = useRouter()
const ui = useUiStore()
const targets = useTargets()
const explain = useExplainPlan()
const overrides = useSetOverrides()

const version = targets.version
const welcome = computed(() => route.query.welcome === '1')

const SECTIONS: { title: string; keys: readonly TargetKey[] }[] = [
  { title: 'Macros', keys: ['protein_g', 'carbs_g', 'fat_g', 'fiber_g'] },
  {
    title: 'Limits',
    keys: ['added_sugar_g', 'saturated_fat_g', 'sodium_mg', 'alcohol_std_drinks'],
  },
  { title: 'Hydration', keys: ['water_ml'] },
  { title: 'Vitamins and minerals', keys: MICRO_KEYS },
  { title: 'Food groups', keys: FOOD_GROUP_KEYS },
]

function entry(key: TargetKey): TargetEntry | null {
  return version.value ? (targetFor(version.value.effective, key) ?? null) : null
}
function recommended(key: TargetKey): TargetEntry | null {
  return version.value ? (targetFor(version.value.computed, key) ?? null) : null
}

const energy = computed(() => entry('energy_kcal'))
const meta = computed(() => version.value?.effective.meta ?? null)
const macroKcal = computed(() => {
  const p = entry('protein_g')?.value ?? 0
  const c = entry('carbs_g')?.value ?? 0
  const f = entry('fat_g')?.value ?? 0
  return { protein: p * 4, carbs: c * 4, fat: f * 9, total: p * 4 + c * 4 + f * 9 }
})
const macroShare = (kcal: number) =>
  macroKcal.value.total > 0 ? Math.round((kcal / macroKcal.value.total) * 100) : 0

// The explanation is generated on first view and cached on the version.
let requested = false
watch(
  version,
  (current) => {
    if (current && !current.explanation && !requested && ui.online) {
      requested = true
      explain.mutate(false)
    }
  },
  { immediate: true },
)
const explainError = computed(() => {
  const error = explain.error.value
  if (!error) return null
  return error instanceof ApiError ? error.message : 'Could not write the explanation.'
})

// Override sheet.
const editingKey = ref<TargetKey | null>(null)
const sheetOpen = computed({
  get: () => editingKey.value !== null,
  set: (open: boolean) => {
    if (!open) editingKey.value = null
  },
})
const serverError = ref<string | null>(null)

function edit(key: TargetKey): void {
  serverError.value = null
  overrides.reset()
  editingKey.value = key
}

function applyOverride(value: number | null, confirm: boolean): void {
  const key = editingKey.value
  if (!key) return
  serverError.value = null
  overrides.mutate(
    { overrides: { [key]: value }, confirm },
    {
      onSuccess: (result) => {
        editingKey.value = null
        const warning = result.warnings[0]
        if (warning) ui.toast(warning.message, 'info')
        else ui.toast(value === null ? 'Back to the recommended target' : 'Target saved', 'success')
      },
      onError: (error: unknown) => {
        serverError.value =
          error instanceof ApiError ? error.message : 'Could not save. Please try again.'
      },
    },
  )
}
</script>

<template>
  <AppShell title="Your targets" :back="{ name: 'you' }">
    <template #header-right>
      <IconButton
        label="Target history"
        icon="clock"
        @click="router.push({ name: 'targets-history' })"
      />
    </template>

    <div v-if="targets.isLoading.value" class="space-y-4" aria-busy="true">
      <Skeleton class="h-36 w-full" rounded="card" />
      <Skeleton class="h-40 w-full" rounded="card" />
      <Skeleton class="h-56 w-full" rounded="card" />
    </div>

    <Card v-else-if="targets.isError.value || !version">
      <h2 class="text-base font-semibold">Couldn't load your targets</h2>
      <p class="mt-1 text-sm text-fg-muted">
        {{ targets.error.value?.message ?? 'Something went wrong.' }}
      </p>
      <Button class="mt-4" variant="secondary" @click="targets.refetch()">Try again</Button>
    </Card>

    <div v-else class="space-y-4">
      <p
        v-if="welcome"
        class="flex items-start gap-2 rounded-card border border-accent/40 bg-accent/10 p-4 text-sm text-fg"
      >
        <Icon name="sparkles" :size="18" class="mt-0.5 shrink-0 text-accent" />
        Your plan is ready. Tap any number to see why it is what it is, or to change it.
      </p>

      <!-- Energy: the hero number. -->
      <Card v-if="energy && meta">
        <button type="button" class="w-full text-left" @click="edit('energy_kcal')">
          <div class="flex items-baseline justify-between">
            <span class="text-xs font-medium tracking-wide text-fg-muted uppercase">Energy</span>
            <span v-if="energy.overridden" class="text-xs font-medium text-accent">Set by you</span>
          </div>
          <div class="mt-1 flex items-baseline gap-2">
            <span class="text-hero font-bold text-fg">{{ formatNumber(energy.value) }}</span>
            <span class="text-base text-fg-muted">kcal a day</span>
          </div>
          <p class="mt-2 text-sm text-fg-muted">
            Maintenance {{ formatNumber(Math.round(meta.tdee / 10) * 10) }} kcal
            <template v-if="meta.paceApplied">
              · {{ PACE_LABELS[meta.paceApplied].label }}
              {{ meta.energyAdjustmentKcal >= 0 ? '+' : '−'
              }}{{ formatNumber(Math.abs(meta.energyAdjustmentKcal)) }}
              kcal
            </template>
          </p>
          <p class="mt-2 text-sm text-fg-muted">{{ energy.reason }}</p>
          <span class="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent">
            <Icon name="edit" :size="16" /> Change
          </span>
        </button>

        <!-- Macro split bar. -->
        <div
          class="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
          aria-hidden="true"
        >
          <div class="bg-protein" :style="{ width: `${macroShare(macroKcal.protein)}%` }" />
          <div class="bg-carbs" :style="{ width: `${macroShare(macroKcal.carbs)}%` }" />
          <div class="bg-fat" :style="{ width: `${macroShare(macroKcal.fat)}%` }" />
        </div>
        <div class="mt-2 grid grid-cols-3 gap-2 text-sm">
          <div>
            <span class="inline-block size-2 rounded-full bg-protein" /> Protein
            {{ macroShare(macroKcal.protein) }}%
          </div>
          <div>
            <span class="inline-block size-2 rounded-full bg-carbs" /> Carbs
            {{ macroShare(macroKcal.carbs) }}%
          </div>
          <div>
            <span class="inline-block size-2 rounded-full bg-fat" /> Fat
            {{ macroShare(macroKcal.fat) }}%
          </div>
        </div>
      </Card>

      <ExplanationCard
        :explanation="version.explanation"
        :loading="explain.isPending.value"
        :error="explainError"
        @retry="explain.mutate(false)"
        @regenerate="explain.mutate(true)"
      />

      <Card v-if="meta && (meta.notes.length || meta.professionalGuidance)" class="space-y-2">
        <h2 class="flex items-center gap-2 text-base font-semibold">
          <Icon name="info" :size="18" class="text-close" /> Worth knowing
        </h2>
        <p v-if="meta.professionalGuidance" class="text-sm text-fg">
          Your targets are set to maintenance for safety. Please work with a doctor or dietitian
          before changing your intake.
        </p>
        <ul class="space-y-1">
          <li v-for="note in meta.notes" :key="note" class="text-sm text-fg-muted">{{ note }}</li>
        </ul>
      </Card>

      <Card v-for="section in SECTIONS" :key="section.title" :padded="false">
        <h2 class="px-4 pt-4 pb-1 text-base font-semibold">{{ section.title }}</h2>
        <div class="divide-y divide-border">
          <template v-for="key in section.keys" :key="key">
            <TargetRow v-if="entry(key)" :entry="entry(key)!" @select="edit(key)" />
          </template>
        </div>
        <p v-if="section.title === 'Hydration' && meta" class="px-4 pb-4 text-sm text-fg-muted">
          {{ formatNumber(meta.waterRestDayMl) }} ml on rest days.
        </p>
      </Card>

      <p class="px-2 text-center text-xs text-fg-muted">
        Computed {{ formatDay(version.effectiveFrom) }} from your profile. Change your body, goal or
        training in
        <RouterLink :to="{ name: 'profile' }" class="font-semibold text-accent">Profile</RouterLink>
        and the targets are recomputed; older versions stay in
        <RouterLink :to="{ name: 'targets-history' }" class="font-semibold text-accent"
          >history</RouterLink
        >.
      </p>
    </div>

    <OverrideSheet
      v-model:open="sheetOpen"
      :entry="editingKey ? entry(editingKey) : null"
      :recommended="editingKey ? recommended(editingKey) : null"
      :saving="overrides.isPending.value"
      :server-error="serverError"
      @save="applyOverride"
      @reset="applyOverride(null, false)"
    />
  </AppShell>
</template>
