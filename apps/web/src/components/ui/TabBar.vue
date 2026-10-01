<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import Icon, { type IconName } from './Icon.vue'

const emit = defineEmits<{ add: [] }>()

interface Tab {
  name: string
  label: string
  icon: IconName
  /** Path prefix of the pushed screens that belong to this tab; the tab stays lit on them. */
  section?: string
}

// Two tabs either side of the Log button, which sits in the centre under the thumb.
const LEFT: Tab[] = [
  { name: 'today', label: 'Today', icon: 'home' },
  { name: 'meals', label: 'Meals', icon: 'utensils', section: '/meals' },
]
const RIGHT: Tab[] = [
  { name: 'week', label: 'Week', icon: 'calendar' },
  { name: 'you', label: 'You', icon: 'user' },
]

const route = useRoute()

function isActive(tab: Tab): boolean {
  if (route.name === tab.name) return true
  return tab.section !== undefined && route.path.startsWith(`${tab.section}/`)
}
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/90 backdrop-blur"
    :style="{ paddingBottom: 'env(safe-area-inset-bottom)' }"
    aria-label="Main"
  >
    <div class="mx-auto grid h-16 max-w-[480px] grid-cols-5">
      <RouterLink
        v-for="tab in LEFT"
        :key="tab.name"
        :to="{ name: tab.name }"
        class="flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors"
        :class="isActive(tab) ? 'text-accent' : 'text-fg-muted'"
        :aria-current="isActive(tab) ? 'page' : undefined"
      >
        <Icon :name="tab.icon" :size="24" />
        {{ tab.label }}
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
        v-for="tab in RIGHT"
        :key="tab.name"
        :to="{ name: tab.name }"
        class="flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors"
        :class="isActive(tab) ? 'text-accent' : 'text-fg-muted'"
        :aria-current="isActive(tab) ? 'page' : undefined"
      >
        <Icon :name="tab.icon" :size="24" />
        {{ tab.label }}
      </RouterLink>
    </div>
  </nav>
</template>
