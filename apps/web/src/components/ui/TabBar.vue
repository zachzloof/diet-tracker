<script setup lang="ts">
import { RouterLink } from 'vue-router'
import Icon, { type IconName } from './Icon.vue'

const emit = defineEmits<{ add: [] }>()

const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: 'today', label: 'Today', icon: 'home' },
  { name: 'week', label: 'Week', icon: 'calendar' },
  { name: 'you', label: 'You', icon: 'user' },
]
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/90 backdrop-blur"
    :style="{ paddingBottom: 'env(safe-area-inset-bottom)' }"
    aria-label="Main"
  >
    <div class="mx-auto grid h-16 max-w-[480px] grid-cols-4">
      <RouterLink
        :to="{ name: TABS[0]!.name }"
        class="flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-fg-muted transition-colors"
        active-class="text-accent"
        exact-active-class="text-accent"
      >
        <Icon :name="TABS[0]!.icon" :size="24" />
        {{ TABS[0]!.label }}
      </RouterLink>

      <!-- Log: the app's primary action, raised so a thumb finds it without looking. -->
      <button
        type="button"
        class="flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-fg-muted"
        aria-label="Log food"
        @click="emit('add')"
      >
        <span
          class="-mt-5 flex size-14 items-center justify-center rounded-full bg-accent text-accent-fg shadow-card transition active:scale-95"
          aria-hidden="true"
        >
          <Icon name="plus" :size="28" />
        </span>
        Log
      </button>

      <RouterLink
        v-for="tab in TABS.slice(1)"
        :key="tab.name"
        :to="{ name: tab.name }"
        class="flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-fg-muted transition-colors"
        active-class="text-accent"
      >
        <Icon :name="tab.icon" :size="24" />
        {{ tab.label }}
      </RouterLink>
    </div>
  </nav>
</template>
