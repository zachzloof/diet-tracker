<script setup lang="ts">
import {
  ACTIVITY_LABELS,
  ACTIVITY_LEVELS,
  BODY_FAT_PCT,
  COMMON_ALLERGENS,
  DEFAULT_PACE,
  DIET_PATTERNS,
  DIET_PATTERN_LABELS,
  GOALS,
  GOAL_LABELS,
  PACES_BY_GOAL,
  PACE_LABELS,
  SEXES,
  SEX_LABELS,
  TRAINING_TYPES,
  TRAINING_TYPE_LABELS,
  UNIT_SYSTEMS,
  UNIT_SYSTEM_LABELS,
  activitySchema,
  dietPatternSchema,
  goalSchema,
  paceSchema,
  profileInputSchema,
  sexSchema,
  toValidationDetails,
  trainingTypeSchema,
  unitSystemSchema,
  type Profile,
  type ProfileInput,
} from '@diet-tracker/shared'
import { computed, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AppShell from '@/components/ui/AppShell.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Chip from '@/components/ui/Chip.vue'
import Icon from '@/components/ui/Icon.vue'
import Input from '@/components/ui/Input.vue'
import NumberField from '@/components/ui/NumberField.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import TagInput from '@/components/ui/TagInput.vue'
import Toggle from '@/components/ui/Toggle.vue'
import { dobProblem } from '@/features/onboarding/steps'
import { useTargets } from '@/features/targets/useTargets'
import { ApiError } from '@/lib/api'
import { formatDay } from '@/lib/format'
import { useUiStore } from '@/stores/ui'
import HeightField from './HeightField.vue'
import WeightField from './WeightField.vue'
import { useProfile, useSaveProfile } from './useProfile'

/** Edit anything. Saving recomputes the targets when an engine input changed. */
const ui = useUiStore()
const profileQuery = useProfile()
const targets = useTargets()
const save = useSaveProfile()

type Form = Omit<ProfileInput, 'heightCm' | 'weightKg' | 'trainingDaysPerWeek'> & {
  heightCm: number | null
  weightKg: number | null
  trainingDaysPerWeek: number | null
}

const form = reactive<Form>(fromProfile(null))
const loaded = ref(false)
const fieldErrors = ref<Record<string, string[]>>({})
const formError = ref<string | null>(null)

function fromProfile(profile: Profile | null): Form {
  return {
    sex: profile?.sex ?? 'unspecified',
    dob: profile?.dob ?? '',
    heightCm: profile?.heightCm ?? null,
    weightKg: profile?.weightKg ?? null,
    bodyFatPct: profile?.bodyFatPct ?? null,
    goal: profile?.goal ?? 'maintain',
    pace: profile?.pace ?? null,
    goalWeightKg: profile?.goalWeightKg ?? null,
    activity: profile?.activity ?? 'moderate',
    trainingType: profile?.trainingType ?? 'general',
    trainingDaysPerWeek: profile?.trainingDaysPerWeek ?? 3,
    dietPattern: profile?.dietPattern ?? 'omnivore',
    allergies: [...(profile?.allergies ?? [])],
    dislikes: [...(profile?.dislikes ?? [])],
    timezone: profile?.timezone ?? 'UTC',
    units: profile?.units ?? 'metric',
    flags: { ...(profile?.flags ?? { pregnant: false, breastfeeding: false, edHistory: false }) },
  }
}

watch(
  profileQuery.profile,
  (profile) => {
    if (profile && !loaded.value) {
      Object.assign(form, fromProfile(profile))
      loaded.value = true
    }
  },
  { immediate: true },
)

const error = (field: string) => fieldErrors.value[field]?.[0] ?? null

// Enum selects go through zod so a stray value can never reach the form.
const sex = computed({
  get: () => form.sex,
  set: (v: string) => {
    const p = sexSchema.safeParse(v)
    if (p.success) form.sex = p.data
  },
})
const goal = computed({
  get: () => form.goal,
  set: (v: string) => {
    const p = goalSchema.safeParse(v)
    if (!p.success) return
    form.goal = p.data
    form.pace = DEFAULT_PACE[p.data]
    if (PACES_BY_GOAL[p.data].length === 0) form.goalWeightKg = null
  },
})
const pace = computed({
  get: () => form.pace ?? '',
  set: (v: string) => {
    const p = paceSchema.safeParse(v)
    form.pace = p.success ? p.data : null
  },
})
const activity = computed({
  get: () => form.activity,
  set: (v: string) => {
    const p = activitySchema.safeParse(v)
    if (p.success) form.activity = p.data
  },
})
const trainingType = computed({
  get: () => form.trainingType,
  set: (v: string) => {
    const p = trainingTypeSchema.safeParse(v)
    if (p.success) form.trainingType = p.data
  },
})
const dietPattern = computed({
  get: () => form.dietPattern,
  set: (v: string) => {
    const p = dietPatternSchema.safeParse(v)
    if (p.success) form.dietPattern = p.data
  },
})
const units = computed({
  get: () => form.units,
  set: (v: string) => {
    const p = unitSystemSchema.safeParse(v)
    if (p.success) form.units = p.data
  },
})

const hasPace = computed(() => PACES_BY_GOAL[form.goal].length > 0)
const paceOptions = computed(() =>
  PACES_BY_GOAL[form.goal].map((value) => ({ value, label: PACE_LABELS[value].label })),
)

const TIMEZONES = (() => {
  const zones = new Set<string>(Intl.supportedValuesOf('timeZone'))
  return zones
})()
const timezoneOptions = computed(() => {
  const zones = new Set(TIMEZONES)
  if (form.timezone) zones.add(form.timezone)
  return [...zones].sort().map((value) => ({ value, label: value.replace(/_/g, ' ') }))
})

const toOptions = <T extends string>(values: readonly T[], labels: Record<T, string>) =>
  values.map((value) => ({ value, label: labels[value] }))
const SEX_OPTIONS = toOptions(SEXES, SEX_LABELS)
const GOAL_OPTIONS = GOALS.map((value) => ({ value, label: GOAL_LABELS[value].label }))
const ACTIVITY_OPTIONS = ACTIVITY_LEVELS.map((value) => ({
  value,
  label: `${ACTIVITY_LABELS[value].label}: ${ACTIVITY_LABELS[value].help.toLowerCase()}`,
}))
const TRAINING_OPTIONS = toOptions(TRAINING_TYPES, TRAINING_TYPE_LABELS)
const DIET_OPTIONS = DIET_PATTERNS.map((value) => ({
  value,
  label: DIET_PATTERN_LABELS[value].label,
}))
const UNIT_OPTIONS = toOptions(UNIT_SYSTEMS, UNIT_SYSTEM_LABELS)

function toggleAllergen(item: string): void {
  form.allergies = form.allergies.includes(item)
    ? form.allergies.filter((existing) => existing !== item)
    : [...form.allergies, item]
}

const dobError = computed(() => error('dob') ?? dobProblem(form.dob))

function submit(): void {
  fieldErrors.value = {}
  formError.value = null
  const parsed = profileInputSchema.safeParse({
    ...form,
    pace: hasPace.value ? form.pace : null,
    goalWeightKg: hasPace.value ? form.goalWeightKg : null,
    trainingDaysPerWeek: form.trainingDaysPerWeek ?? 0,
  })
  if (!parsed.success) {
    fieldErrors.value = toValidationDetails(parsed.error).fieldErrors
    formError.value = 'Check the highlighted fields'
    return
  }
  if (dobProblem(form.dob)) {
    fieldErrors.value = { dob: [dobProblem(form.dob) ?? ''] }
    return
  }
  save.mutate(parsed.data, {
    onSuccess: (result) => {
      ui.toast(
        result.targetsChanged ? 'Profile saved. Targets recomputed.' : 'Profile saved.',
        'success',
      )
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        fieldErrors.value = err.fieldErrors
        formError.value = Object.keys(err.fieldErrors).length ? null : err.message
      } else {
        formError.value = 'Something went wrong. Please try again.'
      }
    },
  })
}
</script>

<template>
  <AppShell title="Profile" :back="{ name: 'you' }">
    <div v-if="profileQuery.isLoading.value" class="space-y-4" aria-busy="true">
      <Skeleton class="h-12 w-full" />
      <Skeleton class="h-40 w-full" rounded="card" />
      <Skeleton class="h-40 w-full" rounded="card" />
    </div>

    <Card v-else-if="profileQuery.isError.value">
      <h2 class="text-base font-semibold">Couldn't load your profile</h2>
      <p class="mt-1 text-sm text-fg-muted">
        {{ profileQuery.error.value?.message ?? 'Something went wrong.' }}
      </p>
      <Button class="mt-4" variant="secondary" @click="profileQuery.refetch()">Try again</Button>
    </Card>

    <form v-else class="space-y-4" novalidate @submit.prevent="submit">
      <p
        v-if="targets.version.value"
        class="flex items-center gap-2 rounded-card border border-border bg-surface px-4 py-3 text-sm text-fg-muted"
      >
        <Icon name="target" :size="18" class="shrink-0 text-accent" />
        <span class="min-w-0 flex-1">
          Targets last changed {{ formatDay(targets.version.value.effectiveFrom) }}.
        </span>
        <RouterLink :to="{ name: 'targets' }" class="shrink-0 font-semibold text-accent">
          View
        </RouterLink>
      </p>

      <Card class="space-y-4">
        <h2 class="text-base font-semibold">Body</h2>
        <Select v-model="units" label="Units" :options="UNIT_OPTIONS" />
        <Select v-model="sex" label="Sex" :options="SEX_OPTIONS" :error="error('sex')" />
        <Input
          v-model="form.dob"
          label="Date of birth"
          type="date"
          autocomplete="bday"
          :error="dobError"
        />
        <HeightField v-model="form.heightCm" :units="form.units" :error="error('heightCm')" />
        <WeightField v-model="form.weightKg" :units="form.units" :error="error('weightKg')" />
        <NumberField
          v-model="form.bodyFatPct"
          label="Body fat (optional)"
          unit="%"
          :min="BODY_FAT_PCT.min"
          :max="BODY_FAT_PCT.max"
          :step="0.5"
          placeholder="Leave blank if unsure"
          :error="error('bodyFatPct')"
        />
      </Card>

      <Card class="space-y-4">
        <h2 class="text-base font-semibold">Goal</h2>
        <Select v-model="goal" label="Goal" :options="GOAL_OPTIONS" :error="error('goal')" />
        <Select
          v-if="hasPace"
          v-model="pace"
          label="Pace"
          :options="paceOptions"
          :error="error('pace')"
        />
        <WeightField
          v-if="hasPace"
          v-model="form.goalWeightKg"
          :units="form.units"
          label="Goal weight (optional)"
          :error="error('goalWeightKg')"
        />
      </Card>

      <Card class="space-y-4">
        <h2 class="text-base font-semibold">Activity and training</h2>
        <Select
          v-model="activity"
          label="Activity level"
          :options="ACTIVITY_OPTIONS"
          :error="error('activity')"
        />
        <Select
          v-model="trainingType"
          label="Main type of training"
          :options="TRAINING_OPTIONS"
          :error="error('trainingType')"
        />
        <NumberField
          v-model="form.trainingDaysPerWeek"
          label="Sessions a week"
          unit="days"
          :min="0"
          :max="7"
          :step="1"
          :error="error('trainingDaysPerWeek')"
        />
      </Card>

      <Card class="space-y-4">
        <h2 class="text-base font-semibold">Food</h2>
        <Select
          v-model="dietPattern"
          label="Diet pattern"
          :options="DIET_OPTIONS"
          :error="error('dietPattern')"
        />
        <div class="space-y-2">
          <span class="block text-sm font-medium text-fg-muted">Allergies and intolerances</span>
          <div class="flex flex-wrap gap-2" role="group" aria-label="Common allergens">
            <button
              v-for="item in COMMON_ALLERGENS"
              :key="item"
              type="button"
              class="flex min-h-11 items-center"
              :aria-pressed="form.allergies.includes(item)"
              @click="toggleAllergen(item)"
            >
              <Chip :tone="form.allergies.includes(item) ? 'accent' : 'neutral'">{{ item }}</Chip>
            </button>
          </div>
        </div>
        <TagInput v-model="form.allergies" label="Other allergies" placeholder="e.g. kiwi" />
        <TagInput v-model="form.dislikes" label="Dislikes" placeholder="e.g. coriander" />
      </Card>

      <Card>
        <h2 class="mb-1 text-base font-semibold">Health</h2>
        <div class="divide-y divide-border">
          <Toggle v-model="form.flags.pregnant" label="Pregnant" />
          <Toggle v-model="form.flags.breastfeeding" label="Breastfeeding" />
          <Toggle v-model="form.flags.edHistory" label="History of disordered eating" />
        </div>
        <p class="mt-2 text-sm text-fg-muted">
          If any apply, targets are set to maintenance with no deficit.
        </p>
      </Card>

      <Card class="space-y-4">
        <h2 class="text-base font-semibold">Time zone</h2>
        <Select
          v-model="form.timezone"
          label="Your day starts and ends in"
          :options="timezoneOptions"
          :error="error('timezone')"
        />
      </Card>

      <p
        v-if="formError"
        class="flex items-start gap-2 rounded-control border border-over/40 bg-over/10 px-3 py-2.5 text-sm text-fg"
        role="alert"
      >
        <Icon name="alert" :size="18" class="mt-0.5 shrink-0 text-over" />
        {{ formError }}
      </p>

      <div
        class="sticky bottom-0 -mx-4 border-t border-border bg-bg/95 px-4 pt-3 backdrop-blur"
        :style="{
          paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))',
          marginBottom: 'calc(-5rem - env(safe-area-inset-bottom) - 1rem)',
        }"
      >
        <Button type="submit" block :loading="save.isPending.value" :disabled="!ui.online">
          {{ ui.online ? 'Save changes' : 'Offline' }}
        </Button>
      </div>
    </form>
  </AppShell>
</template>
