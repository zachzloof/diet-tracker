<script setup lang="ts">
import { computed } from 'vue'
import AppShell from '@/components/ui/AppShell.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useSession } from '@/features/auth/useSession'
import InstallHint from '@/features/pwa/InstallHint.vue'

const session = useSession()

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
})

const today = new Date().toLocaleDateString(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})
</script>

<template>
  <AppShell title="Today">
    <template #header-right>
      <span class="text-sm text-fg-muted">{{ today }}</span>
    </template>

    <!-- Loading: skeletons in the layout's shape. -->
    <div v-if="session.isLoading.value" class="space-y-4" aria-busy="true">
      <Skeleton class="h-7 w-48" />
      <Skeleton class="h-40 w-full" rounded="card" />
      <Skeleton class="h-24 w-full" rounded="card" />
    </div>

    <!-- Error: plain words and a retry. -->
    <Card v-else-if="session.isError.value">
      <h2 class="text-base font-semibold">Couldn't load your day</h2>
      <p class="mt-1 text-sm text-fg-muted">
        {{ session.error.value?.message ?? 'Something went wrong.' }}
      </p>
      <Button class="mt-4" variant="secondary" @click="session.refetch()">Try again</Button>
    </Card>

    <div v-else class="space-y-4">
      <p class="text-[28px] leading-tight font-bold">{{ greeting }}</p>
      <InstallHint />
      <Card :padded="false">
        <EmptyState
          icon="sparkles"
          title="Your day will show up here"
          description="Set up your targets once onboarding lands in the next slice. Logging food follows right after."
        />
      </Card>
    </div>
  </AppShell>
</template>
