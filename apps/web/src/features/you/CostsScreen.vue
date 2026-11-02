<script setup lang="ts">
import { groupAiCosts, sumAiCosts, type AiCostRow, type AiPurpose } from '@diet-tracker/shared'
import { computed } from 'vue'
import AppShell from '@/components/ui/AppShell.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import StatTile from '@/components/ui/StatTile.vue'
import { useAiCosts } from '@/features/coach/useCoach'
import { formatDay } from '@/lib/format'
import { useUiStore } from '@/stores/ui'

/**
 * The owner's AI cost view (slice 11c): calls, tokens and web searches for the last 30
 * days, by purpose and by person. Reachable from a Costs row under You that only the
 * account named by `OWNER_EMAIL` sees; anyone else gets the API's 404 here.
 */
const ui = useUiStore()
const costs = useAiCosts()

const PURPOSE_LABELS: Readonly<Record<AiPurpose, string>> = {
  explain_plan: 'Plan explanations',
  estimate: 'Food estimates',
  weekly_review: 'Weekly reviews',
  coach: 'Coach turns',
  brief: 'Daily briefs',
}

const totals = computed(() => (costs.data.value ? sumAiCosts(costs.data.value.rows) : null))
const byPurpose = computed(() =>
  costs.data.value ? groupAiCosts(costs.data.value.rows, (row) => row.purpose) : [],
)
const byPerson = computed(() =>
  costs.data.value
    ? groupAiCosts(costs.data.value.rows, (row) => row.email ?? row.userId ?? 'no account')
    : [],
)

function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} M`
  if (value >= 10_000) return `${Math.round(value / 1000)} k`
  return value.toLocaleString(undefined)
}

function line(
  row: Pick<AiCostRow, 'calls' | 'failed' | 'inputTokens' | 'outputTokens' | 'webSearchCalls'>,
): string {
  const parts = [
    `${row.calls} ${row.calls === 1 ? 'call' : 'calls'}`,
    `${compact(row.inputTokens)} in`,
    `${compact(row.outputTokens)} out`,
  ]
  if (row.webSearchCalls > 0)
    parts.push(`${row.webSearchCalls} ${row.webSearchCalls === 1 ? 'search' : 'searches'}`)
  if (row.failed > 0) parts.push(`${row.failed} failed`)
  return parts.join(' · ')
}
</script>

<template>
  <AppShell title="AI costs" :back="{ name: 'you' }">
    <div class="space-y-4">
      <div v-if="costs.isLoading.value" class="space-y-4" aria-busy="true">
        <div class="grid grid-cols-2 gap-3">
          <Skeleton class="h-20 w-full" rounded="card" />
          <Skeleton class="h-20 w-full" rounded="card" />
          <Skeleton class="h-20 w-full" rounded="card" />
          <Skeleton class="h-20 w-full" rounded="card" />
        </div>
        <Skeleton class="h-40 w-full" rounded="card" />
      </div>

      <Card v-else-if="costs.isError.value">
        <h2 class="flex items-center gap-2 text-base font-semibold">
          <Icon :name="ui.online ? 'alert' : 'wifi-off'" :size="20" class="text-fg-muted" />
          {{ ui.online ? "Couldn't load the costs" : "You're offline" }}
        </h2>
        <p class="mt-1 text-sm text-fg-muted">
          {{ costs.error.value?.message ?? 'Something went wrong.' }}
        </p>
        <Button class="mt-4" variant="secondary" @click="costs.refetch()">Try again</Button>
      </Card>

      <template v-else-if="costs.data.value && totals">
        <p class="px-1 text-sm text-fg-muted">
          Every OpenAI call since {{ formatDay(costs.data.value.since.slice(0, 10)) }}, the last
          {{ costs.data.value.days }} days. Tokens are what the bill is made of; searches are billed
          per call on top.
        </p>

        <div class="grid grid-cols-2 gap-3">
          <StatTile
            label="Calls"
            :value="totals.calls.toLocaleString()"
            :sub="totals.failed ? `${totals.failed} failed` : 'all answered'"
          />
          <StatTile
            label="Searches"
            :value="totals.webSearchCalls.toLocaleString()"
            sub="web search, per call"
          />
          <StatTile
            label="Tokens in"
            :value="compact(totals.inputTokens)"
            sub="prompt and replay"
          />
          <StatTile
            label="Tokens out"
            :value="compact(totals.outputTokens)"
            sub="answers and reasoning"
          />
        </div>

        <Card v-if="byPurpose.length" :padded="false">
          <h2 class="px-4 pt-4 pb-2 text-base font-semibold">By purpose</h2>
          <ul class="divide-y divide-border">
            <li v-for="group in byPurpose" :key="group.key" class="px-4 py-3">
              <p class="text-base font-medium text-fg">{{ PURPOSE_LABELS[group.key] }}</p>
              <p class="text-sm text-fg-muted">{{ line(group.totals) }}</p>
            </li>
          </ul>
        </Card>

        <Card v-if="byPerson.length" :padded="false">
          <h2 class="px-4 pt-4 pb-2 text-base font-semibold">By person</h2>
          <ul class="divide-y divide-border">
            <li v-for="group in byPerson" :key="group.key" class="px-4 py-3">
              <p class="truncate text-base font-medium text-fg">{{ group.key }}</p>
              <p class="text-sm text-fg-muted">{{ line(group.totals) }}</p>
              <ul class="mt-1.5 space-y-0.5">
                <li
                  v-for="row in group.rows"
                  :key="row.purpose"
                  class="flex items-baseline justify-between gap-3 text-xs text-fg-muted"
                >
                  <span class="shrink-0">{{ PURPOSE_LABELS[row.purpose] }}</span>
                  <span class="truncate text-right tabular-nums">{{ line(row) }}</span>
                </li>
              </ul>
            </li>
          </ul>
        </Card>

        <Card v-else>
          <p class="text-sm text-fg-muted">
            No AI calls in the last {{ costs.data.value.days }} days.
          </p>
        </Card>
      </template>
    </div>
  </AppShell>
</template>
