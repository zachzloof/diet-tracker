<script setup lang="ts">
import type { MuscleGroupShare } from '@diet-tracker/shared'
import { computed } from 'vue'
import Card from '@/components/ui/Card.vue'
import Icon from '@/components/ui/Icon.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import { formatNumber } from '@/lib/format'

/**
 * Where the working sets went (`muscleGroupSets`), most first, as bars against the busiest
 * group. A set counts for every group its exercise lists, so the bars add up to more than the
 * sets done; the caption says so.
 */
const props = defineProps<{ muscles: (MuscleGroupShare & { label: string })[] }>()

const most = computed(() => Math.max(1, ...props.muscles.map((share) => share.sets)))
</script>

<template>
  <Card>
    <h2 class="flex items-center gap-2 text-base font-semibold">
      <Icon name="target" :size="20" class="text-accent" />
      Muscle groups
    </h2>
    <p class="mt-0.5 text-xs text-fg-muted">
      Working sets per group. A set counts for every group its exercise works, so a bench press set
      is a chest set and a triceps set.
    </p>
    <p v-if="muscles.length === 0" class="mt-3 text-sm text-fg-muted">
      No working sets in this range.
    </p>
    <ul v-else class="mt-3 space-y-2.5">
      <li v-for="share in muscles" :key="share.group">
        <div class="flex items-baseline justify-between gap-2 text-sm">
          <span class="font-medium text-fg">{{ share.label }}</span>
          <span class="text-fg-muted tabular-nums">
            <span class="font-semibold text-fg">{{ share.sets }}</span>
            {{ share.sets === 1 ? 'set' : 'sets' }} ·
            {{ formatNumber(Math.round(share.perWeek * 10) / 10, 1) }} a week
          </span>
        </div>
        <ProgressBar
          class="mt-1"
          :value="share.sets"
          :max="most"
          :label="`${share.label}: ${share.sets} working sets`"
        />
      </li>
    </ul>
  </Card>
</template>
