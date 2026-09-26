<script setup lang="ts">
import { GOAL_LABELS, targetValue } from '@diet-tracker/shared'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import AppShell from '@/components/ui/AppShell.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Icon from '@/components/ui/Icon.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useLogout, useSession } from '@/features/auth/useSession'
import { useProfile } from '@/features/profile/useProfile'
import InstallHint from '@/features/pwa/InstallHint.vue'
import { useTargets } from '@/features/targets/useTargets'
import { formatDay, formatNumber, formatWeight } from '@/lib/format'
import { useUiStore, type ThemePreference } from '@/stores/ui'

const session = useSession()
const profile = useProfile()
const targets = useTargets()
const appVersion = __APP_VERSION__
const logout = useLogout()
const ui = useUiStore()

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

const memberSince = computed(() => {
  const user = session.user.value
  if (!user) return ''
  return new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
})

const profileSummary = computed(() => {
  const p = profile.profile.value
  if (!p) return 'Not set up yet'
  return `${GOAL_LABELS[p.goal].label} · ${formatWeight(p.weightKg, p.units)}`
})

const targetsSummary = computed(() => {
  const v = targets.version.value
  if (!v) return 'Computed from your profile'
  return `${formatNumber(targetValue(v.effective, 'energy_kcal'))} kcal · ${formatNumber(targetValue(v.effective, 'protein_g'))} g protein · since ${formatDay(v.effectiveFrom)}`
})
</script>

<template>
  <AppShell title="You">
    <div class="space-y-4">
      <Card>
        <div v-if="session.isLoading.value" class="space-y-2" aria-busy="true">
          <Skeleton class="h-5 w-40" />
          <Skeleton class="h-4 w-28" />
        </div>
        <div v-else-if="session.user.value" class="flex items-center gap-3">
          <div
            class="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-muted"
            aria-hidden="true"
          >
            <Icon name="user" :size="22" />
          </div>
          <div class="min-w-0">
            <p class="truncate text-base font-semibold">{{ session.user.value.email }}</p>
            <p class="text-sm text-fg-muted">Member since {{ memberSince }}</p>
          </div>
        </div>
        <p v-else class="text-sm text-fg-muted">
          {{ session.error.value?.message ?? 'Could not load your account.' }}
        </p>
      </Card>

      <Card :padded="false">
        <nav class="divide-y divide-border" aria-label="Profile and targets">
          <RouterLink
            :to="{ name: 'profile' }"
            class="flex min-h-14 items-center gap-3 px-4 py-3 transition hover:bg-surface-2"
          >
            <span
              class="flex size-10 items-center justify-center rounded-full bg-surface-2 text-fg-muted"
            >
              <Icon name="edit" :size="20" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-base font-semibold">Profile</span>
              <span class="block truncate text-sm text-fg-muted">{{ profileSummary }}</span>
            </span>
            <Icon name="chevron-right" :size="18" class="text-fg-muted" />
          </RouterLink>
          <RouterLink
            :to="{ name: 'foods' }"
            class="flex min-h-14 items-center gap-3 px-4 py-3 transition hover:bg-surface-2"
          >
            <span
              class="flex size-10 items-center justify-center rounded-full bg-surface-2 text-fg-muted"
            >
              <Icon name="book" :size="20" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-base font-semibold">My foods</span>
              <span class="block truncate text-sm text-fg-muted"
                >Saved foods for one-tap logging</span
              >
            </span>
            <Icon name="chevron-right" :size="18" class="text-fg-muted" />
          </RouterLink>
          <RouterLink
            :to="{ name: 'targets' }"
            class="flex min-h-14 items-center gap-3 px-4 py-3 transition hover:bg-surface-2"
          >
            <span
              class="flex size-10 items-center justify-center rounded-full bg-accent/15 text-accent"
            >
              <Icon name="target" :size="20" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-base font-semibold">Targets</span>
              <span class="block truncate text-sm text-fg-muted">{{ targetsSummary }}</span>
            </span>
            <Icon name="chevron-right" :size="18" class="text-fg-muted" />
          </RouterLink>
        </nav>
      </Card>

      <Card>
        <h2 class="mb-3 text-base font-semibold">Appearance</h2>
        <SegmentedControl v-model="theme" label="Theme" :options="THEMES" />
      </Card>

      <InstallHint />

      <Button
        block
        variant="destructive"
        :loading="logout.isPending.value"
        @click="logout.mutate()"
      >
        <Icon name="log-out" :size="20" />
        Log out
      </Button>

      <p class="px-2 text-center text-xs text-fg-muted">
        Diet Tracker {{ appVersion }}. Not medical advice: targets are general guidance, not a
        prescription.
      </p>
    </div>
  </AppShell>
</template>
