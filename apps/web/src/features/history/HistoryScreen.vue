<script setup lang="ts">
import { addMonths, monthOf } from '@diet-tracker/shared'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '@/components/ui/AppShell.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useLocalDay } from '@/features/log/useLocalDay'
import { useMonthStats } from '@/features/stats/useStats'
import { formatMonth } from '@/lib/format'
import MonthCalendar from './MonthCalendar.vue'

/** A month calendar with a day-met dot per day. Tap a day to open its log. */
const router = useRouter()
const { today } = useLocalDay()
const month = ref(monthOf(today.value))
const isCurrent = computed(() => month.value === monthOf(today.value))
const stats = useMonthStats(month)

const met = computed(() => stats.stats.value?.days.filter((d) => d.dayMet).length ?? 0)
const logged = computed(() => stats.stats.value?.days.filter((d) => d.logged).length ?? 0)

function open(day: string): void {
  void router.push({ name: 'day', params: { day } })
}
</script>

<template>
  <AppShell title="History" :back="{ name: 'week' }">
    <template #header-right>
      <div class="flex items-center">
        <IconButton
          label="Previous month"
          icon="chevron-left"
          @click="month = addMonths(month, -1)"
        />
        <IconButton
          label="Next month"
          icon="chevron-right"
          :disabled="isCurrent"
          @click="month = addMonths(month, 1)"
        />
      </div>
    </template>

    <Card>
      <div class="flex items-baseline justify-between gap-2">
        <h2 class="text-xl font-semibold">{{ formatMonth(month) }}</h2>
        <p v-if="stats.stats.value" class="text-xs text-fg-muted">
          <span class="font-semibold text-fg">{{ met }}</span> met of {{ logged }} logged
        </p>
      </div>

      <div v-if="stats.isLoading.value" class="mt-4 space-y-2" aria-busy="true">
        <Skeleton class="h-4 w-full" />
        <Skeleton class="h-64 w-full" rounded="card" />
      </div>

      <div v-else-if="stats.isError.value" class="mt-4">
        <p class="text-sm text-fg-muted">{{ stats.error.value?.message }}</p>
        <Button class="mt-3" variant="secondary" @click="stats.refetch()">Try again</Button>
      </div>

      <MonthCalendar
        v-else-if="stats.stats.value"
        class="mt-4"
        :month="month"
        :days="stats.stats.value.days"
        :today="stats.stats.value.today"
        @open="open"
      />
    </Card>

    <p class="mt-4 px-2 text-center text-xs text-fg-muted">
      Tap a day to see what you logged. Days in the future cannot be opened yet.
    </p>
  </AppShell>
</template>
