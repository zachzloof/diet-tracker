<script setup lang="ts">
import {
  UNIT_SYSTEMS,
  UNIT_SYSTEM_LABELS,
  profileInputSchema,
  unitSystemSchema,
  type ExportFormat,
} from '@diet-tracker/shared'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppShell from '@/components/ui/AppShell.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Icon, { type IconName } from '@/components/ui/Icon.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Toggle from '@/components/ui/Toggle.vue'
import { usePreferences } from '@/features/profile/usePreferences'
import { useProfile, useSaveProfile } from '@/features/profile/useProfile'
import { ApiError } from '@/lib/api'
import { isNative } from '@/lib/native'
import { useAiConsentStore } from '@/stores/ai-consent'
import { useUiStore, type ThemePreference } from '@/stores/ui'
import ChangePasswordSheet from './ChangePasswordSheet.vue'
import DeleteAccountSheet from './DeleteAccountSheet.vue'
import RemindersCard from './RemindersCard.vue'
import { accountApi } from './api'

/**
 * Settings (slice 5): appearance, units, time zone, reminders, AI permission, password,
 * export, delete, and the legal pages. Units and time zone live on the profile, so changing them here is
 * a profile save (targets are untouched: neither is an engine input).
 */
const ui = useUiStore()
const profileQuery = useProfile()
const save = useSaveProfile()
const appVersion = __APP_VERSION__

const theme = computed({
  get: () => ui.theme,
  set: (value: string) => {
    if (value === 'system' || value === 'dark' || value === 'light') ui.setTheme(value)
  },
})
const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
]

const UNIT_OPTIONS = UNIT_SYSTEMS.map((value) => ({ value, label: UNIT_SYSTEM_LABELS[value] }))
const TIMEZONE_OPTIONS = (() => {
  const zones = new Set<string>(Intl.supportedValuesOf('timeZone'))
  const current = profileQuery.profile.value?.timezone
  if (current) zones.add(current)
  return [...zones].sort().map((value) => ({ value, label: value.replace(/_/g, ' ') }))
})()

function saveField(patch: { units?: string; timezone?: string }, label: string): void {
  const profile = profileQuery.profile.value
  if (!profile) return
  const parsed = profileInputSchema.safeParse({ ...profile, ...patch })
  if (!parsed.success) {
    ui.toast(`Could not save ${label}.`, 'error')
    return
  }
  save.mutate(parsed.data, {
    onSuccess: () => ui.toast(`${label} saved.`, 'success'),
    onError: (error: unknown) =>
      ui.toast(error instanceof ApiError ? error.message : `Could not save ${label}.`, 'error'),
  })
}
const units = computed({
  get: () => profileQuery.profile.value?.units ?? 'metric',
  set: (value: string) => {
    const parsed = unitSystemSchema.safeParse(value)
    if (parsed.success) saveField({ units: parsed.data }, 'Units')
  },
})
const timezone = computed({
  get: () => profileQuery.profile.value?.timezone ?? 'UTC',
  set: (value: string) => saveField({ timezone: value }, 'Time zone'),
})

const prefs = usePreferences()
const preferencesSummary = computed(() => {
  const off = [
    !prefs.value.water && 'water off',
    !prefs.value.workouts && 'workouts off',
    prefs.value.nutrientDetail === 'macros' && 'macros only',
  ].filter((item): item is string => typeof item === 'string')
  return off.length ? off.join(' · ') : 'Water, workouts, nutrient detail'
})

const consent = useAiConsentStore()
const aiAllowed = computed({
  get: () => consent.granted,
  set: (value: boolean) => (value ? consent.grant() : consent.revoke()),
})

const passwordOpen = ref(false)
const deleteOpen = ref(false)

const EXPORTS: { format: ExportFormat; label: string; sub: string; icon: IconName }[] = [
  {
    format: 'json',
    label: 'Everything as JSON',
    sub: 'Profile, targets, food log, weigh-ins, My foods, reviews',
    icon: 'file-text',
  },
  {
    format: 'log.csv',
    label: 'Food log as CSV',
    sub: 'One row per entry with every nutrient',
    icon: 'download',
  },
  {
    format: 'weight.csv',
    label: 'Weigh-ins as CSV',
    sub: 'Day, weight and note',
    icon: 'download',
  },
]

/** In a browser the link downloads the file; the native shells share it instead. */
const sharing = ref(false)
async function shareExport(event: Event, format: ExportFormat): Promise<void> {
  if (!isNative) return
  event.preventDefault()
  if (sharing.value) return
  sharing.value = true
  try {
    await accountApi.shareExport(format)
  } catch (error) {
    ui.toast(error instanceof ApiError ? error.message : 'Could not export the file.', 'error')
  } finally {
    sharing.value = false
  }
}
</script>

<template>
  <AppShell title="Settings" :back="{ name: 'you' }">
    <div class="space-y-4">
      <Card :padded="false" as="section">
        <RouterLink
          :to="{ name: 'preferences' }"
          class="flex min-h-14 items-center gap-3 px-4 py-3 transition hover:bg-surface-2"
        >
          <span
            class="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent"
          >
            <Icon name="sliders" :size="20" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-base font-semibold">Preferences</span>
            <span class="block truncate text-sm text-fg-muted">{{ preferencesSummary }}</span>
          </span>
          <Icon name="chevron-right" :size="18" class="shrink-0 text-fg-muted" />
        </RouterLink>
      </Card>

      <Card>
        <h2 class="mb-3 text-base font-semibold">Appearance</h2>
        <SegmentedControl v-model="theme" label="Theme" :options="THEMES" />
      </Card>

      <Card>
        <h2 class="mb-3 text-base font-semibold">Units and time</h2>
        <div v-if="profileQuery.isLoading.value" class="space-y-3" aria-busy="true">
          <Skeleton class="h-12 w-full" />
          <Skeleton class="h-12 w-full" />
        </div>
        <div v-else-if="profileQuery.profile.value" class="space-y-4">
          <SegmentedControl v-model="units" label="Units" :options="UNIT_OPTIONS" />
          <Select
            v-model="timezone"
            label="Time zone"
            :options="TIMEZONE_OPTIONS"
            helper="Your day starts and ends at midnight here. Change it when you travel."
            :disabled="save.isPending.value"
          />
        </div>
        <p v-else class="text-sm text-fg-muted">Finish onboarding to set units and time zone.</p>
      </Card>

      <RemindersCard />

      <Card>
        <h2 class="flex items-center gap-2 text-base font-semibold">
          <Icon name="sparkles" :size="20" class="text-accent" />
          AI features
        </h2>
        <Toggle
          v-model="aiAllowed"
          class="mt-2"
          label="Allow AI features"
          description="Food estimates, your plan explained and the weekly review."
        />
        <p class="mt-3 text-xs text-fg-muted">
          These send what you type, a summary of your profile and your numbers to OpenAI, never your
          email address. With this off you can still log from My foods or by hand, and nothing is
          sent.
          <RouterLink :to="{ name: 'privacy' }" class="font-semibold text-fg">
            Privacy policy
          </RouterLink>
        </p>
      </Card>

      <Card :padded="false" as="section">
        <h2 class="px-4 pt-4 pb-1 text-base font-semibold">Your data</h2>
        <p class="px-4 pb-2 text-sm text-fg-muted">
          {{ isNative ? 'Shares' : 'Downloads' }} a file you can keep or open in a spreadsheet.
        </p>
        <ul class="divide-y divide-border">
          <li v-for="item in EXPORTS" :key="item.format">
            <a
              :href="accountApi.exportUrl(item.format)"
              download
              class="flex min-h-14 items-center gap-3 px-4 py-3 transition hover:bg-surface-2"
              @click="shareExport($event, item.format)"
            >
              <span
                class="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-muted"
              >
                <Icon :name="item.icon" :size="20" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-base font-semibold">{{ item.label }}</span>
                <span class="block truncate text-sm text-fg-muted">{{ item.sub }}</span>
              </span>
              <Icon name="chevron-right" :size="18" class="shrink-0 text-fg-muted" />
            </a>
          </li>
        </ul>
      </Card>

      <Card :padded="false" as="section">
        <h2 class="px-4 pt-4 pb-1 text-base font-semibold">Account</h2>
        <ul class="divide-y divide-border">
          <li>
            <button
              type="button"
              class="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2"
              @click="passwordOpen = true"
            >
              <span
                class="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-muted"
              >
                <Icon name="lock" :size="20" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-base font-semibold">Change password</span>
                <span class="block truncate text-sm text-fg-muted"
                  >Signs out your other devices</span
                >
              </span>
              <Icon name="chevron-right" :size="18" class="shrink-0 text-fg-muted" />
            </button>
          </li>
          <li>
            <button
              type="button"
              class="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2"
              @click="deleteOpen = true"
            >
              <span
                class="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger"
              >
                <Icon name="trash" :size="20" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-base font-semibold text-danger">Delete account</span>
                <span class="block truncate text-sm text-fg-muted"
                  >Removes every row, confirmed twice</span
                >
              </span>
              <Icon name="chevron-right" :size="18" class="shrink-0 text-fg-muted" />
            </button>
          </li>
        </ul>
      </Card>

      <Card :padded="false" as="section">
        <h2 class="px-4 pt-4 pb-1 text-base font-semibold">About</h2>
        <ul class="divide-y divide-border">
          <li>
            <RouterLink
              :to="{ name: 'privacy' }"
              class="flex min-h-14 items-center gap-3 px-4 py-3 transition hover:bg-surface-2"
            >
              <span
                class="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-muted"
              >
                <Icon name="shield" :size="20" />
              </span>
              <span class="min-w-0 flex-1 text-base font-semibold">Privacy policy</span>
              <Icon name="chevron-right" :size="18" class="shrink-0 text-fg-muted" />
            </RouterLink>
          </li>
          <li>
            <RouterLink
              :to="{ name: 'terms' }"
              class="flex min-h-14 items-center gap-3 px-4 py-3 transition hover:bg-surface-2"
            >
              <span
                class="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-muted"
              >
                <Icon name="file-text" :size="20" />
              </span>
              <span class="min-w-0 flex-1 text-base font-semibold">Terms of use</span>
              <Icon name="chevron-right" :size="18" class="shrink-0 text-fg-muted" />
            </RouterLink>
          </li>
          <li>
            <RouterLink
              :to="{ name: 'sources' }"
              class="flex min-h-14 items-center gap-3 px-4 py-3 transition hover:bg-surface-2"
            >
              <span
                class="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-muted"
              >
                <Icon name="book" :size="20" />
              </span>
              <span class="min-w-0 flex-1 text-base font-semibold"
                >Where the numbers come from</span
              >
              <Icon name="chevron-right" :size="18" class="shrink-0 text-fg-muted" />
            </RouterLink>
          </li>
        </ul>
        <p class="px-4 py-3 text-xs text-fg-muted">
          Minori {{ appVersion }}. Not medical advice: targets are general guidance, not a
          prescription. For adults 18 and over.
        </p>
      </Card>

      <Button v-if="!ui.online" block variant="secondary" disabled>
        Offline: account changes need a connection
      </Button>
    </div>

    <ChangePasswordSheet v-model:open="passwordOpen" />
    <DeleteAccountSheet v-model:open="deleteOpen" />
  </AppShell>
</template>
