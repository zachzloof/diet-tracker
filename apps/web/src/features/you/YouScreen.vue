<script setup lang="ts">
import { computed } from 'vue'
import AppShell from '@/components/ui/AppShell.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Icon from '@/components/ui/Icon.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useLogout, useSession } from '@/features/auth/useSession'
import InstallHint from '@/features/pwa/InstallHint.vue'
import { useUiStore, type ThemePreference } from '@/stores/ui'

const session = useSession()
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

      <Card>
        <h2 class="mb-3 text-base font-semibold">Appearance</h2>
        <SegmentedControl v-model="theme" label="Theme" :options="THEMES" />
      </Card>

      <InstallHint />

      <Card>
        <h2 class="text-base font-semibold">Profile and targets</h2>
        <p class="mt-1 text-sm text-fg-muted">
          Body, goal, training and diet pattern arrive with onboarding in the next slice.
        </p>
      </Card>

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
