<script setup lang="ts">
import {
  groupAiCosts,
  sumAiCosts,
  totalAiCostUsd,
  type AiCostTotals,
  type AiPurpose,
} from '@diet-tracker/shared'
import { computed, ref } from 'vue'
import AppShell from '@/components/ui/AppShell.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Icon from '@/components/ui/Icon.vue'
import PillToggle, { type PillOption } from '@/components/ui/PillToggle.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import StatTile from '@/components/ui/StatTile.vue'
import { useAiCosts } from '@/features/coach/useCoach'
import { formatDay } from '@/lib/format'
import { useUiStore } from '@/stores/ui'

/**
 * The owner's AI cost view (slice 11c): what the last 30 days of OpenAI calls cost, by
 * purpose and by person, in pounds or in tokens (the pill in the header switches). The
 * money is worked out on the server from OpenAI's list prices per model and arrives in
 * dollars; this screen only applies the exchange rate. Reachable from a Costs row under
 * You that only the account named by `OWNER_EMAIL` sees; anyone else gets the API's 404.
 */
const ui = useUiStore()
const costs = useAiCosts()

type Unit = 'money' | 'tokens'
const UNITS: readonly PillOption[] = [
  { value: 'money', label: '£' },
  { value: 'tokens', label: 'Tokens' },
]
const unit = ref<Unit>('money')
const unitModel = computed({
  get: () => unit.value,
  set: (value: string) => {
    unit.value = value === 'tokens' ? 'tokens' : 'money'
  },
})

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

/** Dollars from the server as pounds: "£12.34", or pence under 10p, where calls live. */
function pounds(usd: number): string {
  const gbp = usd * (costs.data.value?.usdToGbp ?? 0)
  if (gbp <= 0) return '£0'
  if (gbp < 0.001) return '<0.1p'
  if (gbp < 0.1) return `${(gbp * 100).toFixed(1)}p`
  return `£${gbp.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function line(row: AiCostTotals): string {
  const calls = `${row.calls} ${row.calls === 1 ? 'call' : 'calls'}`
  const parts =
    unit.value === 'money'
      ? [pounds(totalAiCostUsd(row)), calls]
      : [calls, `${compact(row.inputTokens)} in`, `${compact(row.outputTokens)} out`]
  if (row.webSearchCalls > 0)
    parts.push(`${row.webSearchCalls} ${row.webSearchCalls === 1 ? 'search' : 'searches'}`)
  if (unit.value === 'money' && row.unpricedCalls > 0) parts.push(`${row.unpricedCalls} unpriced`)
  if (row.failed > 0) parts.push(`${row.failed} failed`)
  return parts.join(' · ')
}
</script>

<template>
  <AppShell title="AI costs" :back="{ name: 'you' }">
    <template #header-right>
      <PillToggle v-model="unitModel" label="Show costs in" :options="UNITS" />
    </template>
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
        <p v-if="unit === 'money'" class="px-1 text-sm text-fg-muted">
          Every OpenAI call since {{ formatDay(costs.data.value.since.slice(0, 10)) }}, the last
          {{ costs.data.value.days }} days, at OpenAI's list prices on
          {{ formatDay(costs.data.value.pricesAsOf) }} and $1 = £{{ costs.data.value.usdToGbp }}.
          <template v-if="totals.unpricedCalls > 0">
            {{ totals.unpricedCalls }}
            {{ totals.unpricedCalls === 1 ? 'call' : 'calls' }} ran on a model with no listed price
            and {{ totals.unpricedCalls === 1 ? 'is' : 'are' }} left out of the money.
          </template>
        </p>
        <p v-else class="px-1 text-sm text-fg-muted">
          Every OpenAI call since {{ formatDay(costs.data.value.since.slice(0, 10)) }}, the last
          {{ costs.data.value.days }} days. Tokens are what the bill is made of; searches are billed
          per call on top.
        </p>

        <div v-if="unit === 'money'" class="grid grid-cols-2 gap-3">
          <StatTile
            label="Total"
            :value="pounds(totalAiCostUsd(totals))"
            :sub="`${pounds(totalAiCostUsd(totals) / costs.data.value.days)} a day`"
          />
          <StatTile
            label="Searches"
            :value="pounds(totals.searchCostUsd)"
            :sub="`${totals.webSearchCalls.toLocaleString()} web ${totals.webSearchCalls === 1 ? 'search' : 'searches'}`"
          />
          <StatTile
            label="Tokens in"
            :value="pounds(totals.inputCostUsd)"
            sub="prompt and replay"
          />
          <StatTile
            label="Tokens out"
            :value="pounds(totals.outputCostUsd)"
            sub="answers and reasoning"
          />
        </div>
        <div v-else class="grid grid-cols-2 gap-3">
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
