<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Icon from '@/components/ui/Icon.vue'
import { useInstallStore } from '@/stores/install'

const install = useInstallStore()
</script>

<template>
  <Card v-if="install.shouldHint">
    <div class="flex items-start gap-3">
      <div
        class="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent"
        aria-hidden="true"
      >
        <Icon name="download" :size="20" />
      </div>
      <div class="min-w-0 flex-1">
        <h2 class="text-base font-semibold">Add to your Home Screen</h2>
        <p v-if="install.ios" class="mt-1 text-sm text-fg-muted">
          Tap <Icon name="share" :size="16" class="inline align-text-bottom" /> Share in Safari,
          then <span class="font-medium text-fg">Add to Home Screen</span>. It opens full-screen
          with its own icon.
        </p>
        <p v-else class="mt-1 text-sm text-fg-muted">
          Install it for a full-screen app with its own icon.
        </p>
        <div class="mt-3 flex gap-2">
          <Button v-if="install.canPrompt" variant="primary" @click="install.install()">
            Install
          </Button>
          <Button variant="ghost" @click="install.dismiss()">Not now</Button>
        </div>
      </div>
    </div>
  </Card>
</template>
