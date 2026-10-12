<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useAppMode } from '@/features/mode/useAppMode'
import type { AppMode } from '@/stores/ui'
import Icon, { type IconName } from './Icon.vue'

const emit = defineEmits<{ add: [] }>()

interface Tab {
  name: string
  label: string
  icon: IconName
  /** Other route names that count as this tab (a specific day under Today). */
  aliases?: string[]
  /** Path prefix of the pushed screens that belong to this tab; the tab stays lit on them. */
  section?: string
}

interface Layout {
  /** Two tabs either side of the Log button, which sits in the centre under the thumb. */
  left: Tab[]
  right: Tab[]
  addLabel: string
}

const YOU: Tab = { name: 'you', label: 'You', icon: 'user' }

// Each half of the app (D38) has its own five slots; You is the same screen in both.
const LAYOUTS: Readonly<Record<AppMode, Layout>> = {
  diet: {
    left: [
      { name: 'today', label: 'Today', icon: 'home', aliases: ['day'] },
      { name: 'meals', label: 'Meals', icon: 'utensils', section: '/meals' },
    ],
    right: [{ name: 'week', label: 'Week', icon: 'calendar' }, YOU],
    addLabel: 'Log food',
  },
  training: {
    left: [
      { name: 'gym-today', label: 'Today', icon: 'home', aliases: ['gym-day'] },
      { name: 'workouts', label: 'Workouts', icon: 'dumbbell', section: '/workouts' },
    ],
    right: [{ name: 'gym-week', label: 'Week', icon: 'calendar', section: '/gym/lifts' }, YOU],
    addLabel: 'Log a workout',
  },
}

const { mode } = useAppMode()
const layout = computed(() => LAYOUTS[mode.value])

const route = useRoute()

function isActive(tab: Tab): boolean {
  if (route.name === tab.name) return true
  if (tab.aliases?.some((name) => route.name === name)) return true
  return (
    tab.section !== undefined &&
    (route.path === tab.section || route.path.startsWith(`${tab.section}/`))
  )
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
        v-for="tab in layout.left"
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
        :aria-label="layout.addLabel"
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
        v-for="tab in layout.right"
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
