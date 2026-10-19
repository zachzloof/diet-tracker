<script setup lang="ts">
import { computed, useSlots } from 'vue'
import { useRouter, type RouteLocationRaw } from 'vue-router'
import QuickAddSheet from '@/features/log/QuickAddSheet.vue'
import { useAppMode } from '@/features/mode/useAppMode'
import { useUiStore } from '@/stores/ui'
import IconButton from './IconButton.vue'
import ModeToggle from './ModeToggle.vue'
import TabBar from './TabBar.vue'

const props = defineProps<{
  title: string
  /** Where "back" goes when this is a pushed detail screen and there is no history. */
  back?: RouteLocationRaw
}>()

const router = useRouter()
const ui = useUiStore()
const { mode, available } = useAppMode()
const slots = useSlots()
const showSwitch = computed(() => !props.back && available.value)
/** A pushed screen may put its own pill in the middle (a session's Last / Best). */
const showCentre = computed(() => Boolean(props.back && slots['header-centre']))
const threeColumns = computed(() => showSwitch.value || showCentre.value)

function goBack(): void {
  if (!props.back) return
  const state: unknown = window.history.state
  const hasHistory =
    typeof state === 'object' && state !== null && Reflect.get(state, 'back') !== null
  if (hasHistory) router.back()
  else void router.replace(props.back)
}

/** The centre button logs food in the food half and starts a session in the gym half. */
function add(): void {
  if (mode.value === 'training') void router.push({ name: 'workout-new' })
  else ui.openQuickAdd()
}
</script>

<template>
  <div class="min-h-dvh bg-bg text-fg">
    <header
      class="fixed inset-x-0 top-0 z-20 border-b border-border bg-bg/90 backdrop-blur"
      :style="{ paddingTop: 'env(safe-area-inset-top)' }"
    >
      <!--
        A grid keeps the switch centred while both sides fit and nudges it, rather than
        truncating the title, on a narrow phone. A pushed screen that fills the centre slot
        keeps its title's words too (capped at 10 rem, since a person typed it) and pads both
        sides alike so the pill is centred whenever there is room.
      -->
      <div
        class="mx-auto grid h-14 max-w-[480px] items-center gap-x-2"
        :class="[
          back ? (showCentre ? 'px-1' : 'pr-4 pl-1') : 'px-4',
          showCentre
            ? 'grid-cols-[minmax(max-content,1fr)_auto_minmax(0,1fr)]'
            : threeColumns
              ? 'grid-cols-[1fr_auto_1fr]'
              : 'grid-cols-[1fr_auto]',
        ]"
      >
        <div class="flex items-center gap-1" :class="!threeColumns && 'min-w-0'">
          <IconButton v-if="back" label="Back" icon="chevron-left" @click="goBack" />
          <h1 class="truncate text-xl font-semibold" :class="showCentre && 'max-w-[10rem]'">
            {{ title }}
          </h1>
        </div>
        <!-- Root screens carry the Food / Gym switch in the middle (D38); a pushed screen may fill it. -->
        <ModeToggle v-if="showSwitch" />
        <slot v-else-if="showCentre" name="header-centre" />
        <div class="flex items-center justify-end" :class="showCentre && 'pr-3'">
          <slot name="header-right" />
        </div>
      </div>
    </header>

    <main
      class="mx-auto max-w-[480px] px-4"
      :style="{
        paddingTop: 'calc(3.5rem + env(safe-area-inset-top) + 1rem)',
        paddingBottom: 'calc(5rem + env(safe-area-inset-bottom) + 1rem)',
      }"
    >
      <slot />
    </main>

    <TabBar @add="add" />
    <QuickAddSheet />
  </div>
</template>
