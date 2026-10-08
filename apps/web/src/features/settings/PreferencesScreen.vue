<script setup lang="ts">
import {
  nutrientDetailSchema,
  type NutrientDetail,
  type PreferencesPatch,
} from '@diet-tracker/shared'
import { computed } from 'vue'
import AppShell from '@/components/ui/AppShell.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Icon from '@/components/ui/Icon.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Toggle from '@/components/ui/Toggle.vue'
import { useProfile } from '@/features/profile/useProfile'
import { usePreferences, useSavePreferences } from '@/features/profile/usePreferences'
import { ApiError } from '@/lib/api'
import { useUiStore } from '@/stores/ui'

/**
 * Settings > Preferences (D37): switch off the parts of the app that get in the way. All
 * on by default. Each change saves on its own; nothing here touches targets or history,
 * so turning something back on shows what was there all along.
 */
const ui = useUiStore()
const profileQuery = useProfile()
const prefs = usePreferences()
const save = useSavePreferences()

function patch(change: PreferencesPatch): void {
  if (!profileQuery.profile.value) return
  save.mutate(change, {
    onError: (error: unknown) =>
      ui.toast(error instanceof ApiError ? error.message : 'Could not save that.', 'error'),
  })
}

const water = computed({
  get: () => prefs.value.water,
  set: (value: boolean) => patch({ water: value }),
})
const workouts = computed({
  get: () => prefs.value.workouts,
  set: (value: boolean) => patch({ workouts: value }),
})
const nutrientDetail = computed({
  get: (): string => prefs.value.nutrientDetail,
  set: (value: string) => {
    const parsed = nutrientDetailSchema.safeParse(value)
    if (parsed.success && parsed.data !== prefs.value.nutrientDetail) {
      patch({ nutrientDetail: parsed.data })
    }
  },
})
const DETAIL_OPTIONS: { value: NutrientDetail; label: string }[] = [
  { value: 'full', label: 'Everything' },
  { value: 'macros', label: 'Macros only' },
]
</script>

<template>
  <AppShell title="Preferences" :back="{ name: 'settings' }">
    <div v-if="profileQuery.isLoading.value" class="space-y-4" aria-busy="true">
      <Skeleton class="h-28 w-full" rounded="card" />
      <Skeleton class="h-28 w-full" rounded="card" />
      <Skeleton class="h-40 w-full" rounded="card" />
    </div>

    <Card v-else-if="!profileQuery.profile.value">
      <p class="text-sm text-fg-muted">
        {{
          profileQuery.isError.value
            ? (profileQuery.error.value?.message ?? 'Could not load your settings.')
            : 'Finish onboarding to set your preferences.'
        }}
      </p>
      <Button
        v-if="profileQuery.isError.value"
        class="mt-4"
        variant="secondary"
        @click="profileQuery.refetch()"
      >
        Try again
      </Button>
    </Card>

    <div v-else class="space-y-4">
      <p class="px-1 text-sm text-fg-muted">
        Everything is on to begin with. Turn off what you don't use; nothing you've logged is lost,
        and you can turn it back on any time.
      </p>

      <Card>
        <h2 class="flex items-center gap-2 text-base font-semibold">
          <Icon name="droplet" :size="20" class="text-water" />
          Water
        </h2>
        <Toggle
          v-model="water"
          class="mt-2"
          label="Track water"
          description="The water card on Today, your hydration target and the water row on Week."
          :disabled="save.isPending.value || !ui.online"
        />
      </Card>

      <Card>
        <h2 class="flex items-center gap-2 text-base font-semibold">
          <Icon name="dumbbell" :size="20" class="text-accent" />
          Workouts
        </h2>
        <Toggle
          v-model="workouts"
          class="mt-2"
          label="Log workouts"
          description="The Training card on Today and Workouts under You. Off, Minori is just the food."
          :disabled="save.isPending.value || !ui.online"
        />
      </Card>

      <Card>
        <h2 class="flex items-center gap-2 text-base font-semibold">
          <Icon name="sparkles" :size="20" class="text-carbs" />
          Nutrient detail
        </h2>
        <p class="mt-1 mb-3 text-sm text-fg-muted">
          How much Today, Week and your targets show about what you eat.
        </p>
        <SegmentedControl
          v-model="nutrientDetail"
          label="Nutrient detail"
          :options="DETAIL_OPTIONS"
        />
        <p class="mt-3 text-sm text-fg-muted">
          <template v-if="nutrientDetail === 'macros'">
            Calories, protein, carbs, fat and fibre. Vitamins, minerals, limits and food groups are
            still estimated and kept, just not shown.
          </template>
          <template v-else>
            Calories and macros plus vitamins, minerals, omega-3, the limits (sodium, saturated fat,
            added sugar) and food-group serves.
          </template>
        </p>
      </Card>

      <p class="px-1 text-xs text-fg-muted">
        Whether a day is met never depends on these: it is energy, protein and your goal's limits
        either way.
      </p>

      <Button v-if="!ui.online" block variant="secondary" disabled>
        Offline: preferences save when you're back online
      </Button>
    </div>
  </AppShell>
</template>
