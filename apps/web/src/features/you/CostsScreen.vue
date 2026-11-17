<script setup lang="ts">
import {
  AI_COST_PERIODS,
  AI_COST_PERIOD_LABELS,
  DEFAULT_AI_COST_PERIOD,
  aiCostPeriodSchema,
  groupAiCosts,
  sumAiCosts,
  totalAiCostUsd,
  type AiCostDay,
  type AiCostPeriod,
  type AiCostTotals,
  type AiPurpose,
} from '@diet-tracker/shared'
import { computed, ref } from 'vue'
import AppShell from '@/components/ui/AppShell.vue'
import BarChart from '@/components/ui/BarChart.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Icon from '@/components/ui/Icon.vue'
import PillToggle, { type PillOption } from '@/components/ui/PillToggle.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import SegmentedControl, { type SegmentOption } from '@/components/ui/SegmentedControl.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import StatTile from '@/components/ui/StatTile.vue'
import { useAiCosts } from '@/features/coach/useCoach'
import { formatDay, formatDayShort } from '@/lib/format'
import { useUiStore } from '@/stores/ui'

/**
 * The owner's AI cost view (slice 11c, D42, D45): what the OpenAI calls of a period cost,
 * today, the last 7, 30 or 90 days or since the first call, against the same stretch before
 * it, by day, purpose, model and person, in pounds or tokens (the header pill). The money is
 * worked out on the server from OpenAI's list prices per model and arrives in dollars; this
 * screen only applies the exchange rate. With an admin key on the server the page also shows
 * what OpenAI itself billed for those days, which is the number to trust. Reachable from a
 * row under You that only the account named by `OWNER_EMAIL` sees.
 */
const ui = useUiStore()

const PERIODS: SegmentOption[] = AI_COST_PERIODS.map((value) => ({
  value,
  label: AI_COST_PERIOD_LABELS[value],
}))
const period = ref<AiCostPeriod>(DEFAULT_AI_COST_PERIOD)
const periodModel = computed({
  get: () => period.value,
  set: (value: string) => {
    const parsed = aiCostPeriodSchema.safeParse(value)
    if (parsed.success) period.value = parsed.data
  },
})
const costs = useAiCosts(period)

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
  coach: 'Coach',
  brief: 'Daily briefs',
}

const data = computed(() => costs.data.value)
const totals = computed(() => (data.value ? sumAiCosts(data.value.rows) : null))
const totalUsd = computed(() => (totals.value ? totalAiCostUsd(totals.value) : 0))
const byPurpose = computed(() =>
  data.value ? groupAiCosts(data.value.rows, (row) => row.purpose) : [],
)
const byPerson = computed(() =>
  data.value ? groupAiCosts(data.value.rows, (row) => row.email ?? row.userId ?? 'no account') : [],
)

// --- Formatting ---------------------------------------------------------------------------

function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} M`
  if (value >= 10_000) return `${Math.round(value / 1000)} k`
  return Math.round(value).toLocaleString(undefined)
}

/** Dollars as pounds: "£12.34" from 10p up, "4.2p" below, "<0.1p" for a crumb. */
function pounds(usd: number): string {
  const gbp = usd * (data.value?.usdToGbp ?? 0)
  if (gbp <= 0) return '£0'
  if (gbp < 0.001) return '<0.1p'
  if (gbp < 0.1) return `${(gbp * 100).toFixed(1)}p`
  return `£${gbp.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`
}

/** "12%" up or down from `before`; null when there was nothing before to compare with. */
function change(now: number, before: number): { up: boolean; text: string } | null {
  if (!(before > 0)) return null
  const pct = Math.round(((now - before) / before) * 100)
  return { up: pct > 0, text: pct === 0 ? 'level' : `${Math.abs(pct)}%` }
}

function cacheHit(row: { inputTokens: number; cachedInputTokens: number }): string {
  return row.inputTokens > 0
    ? `${Math.round((row.cachedInputTokens / row.inputTokens) * 100)}% cached`
    : 'no input'
}

function line(row: AiCostTotals): string {
  const parts =
    unit.value === 'money'
      ? [
          plural(row.calls, 'call'),
          row.calls > 0 ? `${pounds(totalAiCostUsd(row) / row.calls)} each` : '',
        ]
      : [`${compact(row.inputTokens)} in`, cacheHit(row), `${compact(row.outputTokens)} out`]
  if (row.webSearchCalls > 0) parts.push(plural(row.webSearchCalls, 'search', 'searches'))
  if (row.failed > 0) parts.push(`${row.failed} failed`)
  return parts.filter(Boolean).join(' · ')
}

/** The figure on the right of a row: pounds, or calls in the tokens view. */
function figure(row: AiCostTotals): string {
  return unit.value === 'money' ? pounds(totalAiCostUsd(row)) : plural(row.calls, 'call')
}

// --- The headline --------------------------------------------------------------------------

const windowLabel = computed(() => {
  const d = data.value
  if (!d) return ''
  if (d.period === 'today') return 'Today'
  if (d.from === d.to) return formatDay(d.from)
  return `${formatDayShort(d.from)} to ${formatDayShort(d.to)}`
})
const previousLabel = computed(() => {
  const d = data.value
  if (!d?.previous) return ''
  return d.period === 'today' ? 'yesterday' : `the ${d.days} days before`
})
const vsPrevious = computed(() => {
  const d = data.value
  if (!d?.previous) return null
  return unit.value === 'money'
    ? change(totalUsd.value, d.previous.costUsd)
    : change(totals.value?.calls ?? 0, d.previous.calls)
})
const previousFigure = computed(() => {
  const p = data.value?.previous
  if (!p) return ''
  return unit.value === 'money' ? pounds(p.costUsd) : plural(p.calls, 'call')
})

/** How the app's estimate sits against OpenAI's own bill for the same days. */
const billedCheck = computed(() => {
  const billed = data.value?.billed
  if (billed?.status !== 'ok') return null
  const estimate = totalUsd.value
  if (!(billed.costUsd > 0)) {
    return estimate > 0 ? 'OpenAI shows nothing billed yet for these days.' : null
  }
  const ratio = estimate / billed.costUsd
  if (ratio > 0.85 && ratio < 1.15) return 'The estimate is within 15% of the bill.'
  return ratio > 1
    ? `The estimate reads ${ratio.toFixed(1)}× the bill.`
    : `The bill is ${(1 / ratio).toFixed(1)}× the estimate: calls on the same OpenAI project from somewhere else (local runs, smoke tests) are in it.`
})

// --- The chart ------------------------------------------------------------------------------

interface Bucket {
  label: string
  calls: number
  costUsd: number
}

/** Days for up to six weeks; past that, weeks ending today, so every bar stays readable. */
const buckets = computed<{ byWeek: boolean; list: Bucket[] }>(() => {
  const daily: readonly AiCostDay[] = data.value?.daily ?? []
  if (daily.length <= 42) {
    return {
      byWeek: false,
      list: daily.map((d) => ({
        label: formatDayShort(d.day),
        calls: d.calls,
        costUsd: d.costUsd,
      })),
    }
  }
  const list: Bucket[] = []
  for (let end = daily.length; end > 0; end -= 7) {
    const week = daily.slice(Math.max(0, end - 7), end)
    const first = week[0]
    if (!first) continue
    list.unshift({
      label: formatDayShort(first.day),
      calls: week.reduce((sum, d) => sum + d.calls, 0),
      costUsd: week.reduce((sum, d) => sum + d.costUsd, 0),
    })
  }
  return { byWeek: true, list }
})
const usdToGbp = computed(() => data.value?.usdToGbp ?? 0)
const chartValues = computed(() =>
  buckets.value.list.map((b) => (unit.value === 'money' ? b.costUsd * usdToGbp.value : b.calls)),
)
const chartAverage = computed(() => {
  const values = chartValues.value
  return values.length > 1 ? values.reduce((sum, v) => sum + v, 0) / values.length : null
})
function chartFormat(value: number): string {
  if (unit.value === 'tokens') return plural(Math.round(value), 'call')
  return usdToGbp.value > 0 ? pounds(value / usdToGbp.value) : '£0'
}
const labelEvery = computed(() => Math.max(1, Math.ceil(buckets.value.list.length / 6)))

// --- Notes ------------------------------------------------------------------------------------

const purposeShare = (row: AiCostTotals) =>
  unit.value === 'money'
    ? totalUsd.value > 0
      ? (totalAiCostUsd(row) / totalUsd.value) * 100
      : 0
    : (totals.value?.calls ?? 0) > 0
      ? (row.calls / (totals.value?.calls ?? 1)) * 100
      : 0
</script>

<template>
  <AppShell title="AI costs" :back="{ name: 'you' }">
    <template #header-right>
      <PillToggle v-model="unitModel" label="Show costs in" :options="UNITS" />
    </template>
    <div class="space-y-4">
      <SegmentedControl v-model="periodModel" label="Period" :options="PERIODS" />

      <div v-if="costs.isLoading.value" class="space-y-4" aria-busy="true">
        <Skeleton class="h-36 w-full" rounded="card" />
        <Skeleton class="h-48 w-full" rounded="card" />
        <Skeleton class="h-40 w-full" rounded="card" />
      </div>

      <Card v-else-if="costs.isError.value && !data">
        <h2 class="flex items-center gap-2 text-base font-semibold">
          <Icon :name="ui.online ? 'alert' : 'wifi-off'" :size="20" class="text-fg-muted" />
          {{ ui.online ? "Couldn't load the costs" : "You're offline" }}
        </h2>
        <p class="mt-1 text-sm text-fg-muted">
          {{ costs.error.value?.message ?? 'Something went wrong.' }}
        </p>
        <Button class="mt-4" variant="secondary" @click="costs.refetch()">Try again</Button>
      </Card>

      <div
        v-else-if="data && totals"
        class="space-y-4 transition-opacity duration-150"
        :class="costs.isPlaceholder.value && 'opacity-60'"
        :aria-busy="costs.isPlaceholder.value"
      >
        <!-- The headline: what the period cost, and how that moved. -->
        <Card>
          <p class="text-xs font-medium tracking-wide text-fg-muted uppercase">
            {{ windowLabel }}
          </p>
          <p class="mt-1 text-[40px] leading-none font-bold text-fg tabular-nums">
            {{
              unit === 'money'
                ? pounds(totalUsd)
                : compact(totals.inputTokens + totals.outputTokens)
            }}
          </p>
          <p class="mt-1 text-sm text-fg-muted">
            <template v-if="unit === 'money'">
              estimated from {{ plural(totals.calls, 'call') }}
            </template>
            <template v-else> tokens over {{ plural(totals.calls, 'call') }} </template>
          </p>
          <p v-if="data.previous" class="mt-2 flex items-center gap-1.5 text-sm text-fg-muted">
            <template v-if="vsPrevious">
              <Icon
                :name="vsPrevious.up ? 'trending-up' : 'trending-down'"
                :size="16"
                class="shrink-0"
              />
              <span>
                <span class="font-semibold text-fg">{{ vsPrevious.text }}</span>
                {{ vsPrevious.text === 'level' ? 'with' : vsPrevious.up ? 'up on' : 'down on' }}
                {{ previousLabel }} ({{ previousFigure }})
              </span>
            </template>
            <template v-else>Nothing in {{ previousLabel }} to compare with.</template>
          </p>

          <div v-if="data.billed.status === 'ok'" class="mt-3 border-t border-border pt-3 text-sm">
            <p class="flex items-baseline justify-between gap-3">
              <span class="font-medium text-fg">OpenAI billed</span>
              <span class="text-base font-semibold text-fg tabular-nums">
                {{ pounds(data.billed.costUsd) }}
              </span>
            </p>
            <p class="mt-0.5 text-xs text-fg-muted">
              {{ formatDayShort(data.billed.from) }} to {{ formatDayShort(data.billed.to) }} in
              UTC{{ data.billed.projectId ? ', this project only' : ', whole organisation' }}.
              OpenAI's figures can lag a few hours. {{ billedCheck }}
            </p>
          </div>
          <p
            v-else-if="data.billed.status === 'error'"
            class="mt-3 border-t border-border pt-3 text-xs text-fg-muted"
          >
            Couldn't read OpenAI's own bill: {{ data.billed.message }}
          </p>
        </Card>

        <div class="grid grid-cols-2 gap-3">
          <template v-if="unit === 'money'">
            <StatTile
              label="A day"
              :value="pounds(totalUsd / data.days)"
              :sub="plural(data.days, 'day')"
            />
            <StatTile
              label="A call"
              :value="totals.calls ? pounds(totalUsd / totals.calls) : '–'"
              :sub="totals.failed ? `${totals.failed} failed` : 'all answered'"
            />
            <StatTile label="Input" :value="pounds(totals.inputCostUsd)" :sub="cacheHit(totals)" />
            <StatTile
              label="Output"
              :value="pounds(totals.outputCostUsd)"
              :sub="
                totals.webSearchCalls
                  ? `+ ${pounds(totals.searchCostUsd)} on ${plural(totals.webSearchCalls, 'search', 'searches')}`
                  : 'answers and reasoning'
              "
            />
          </template>
          <template v-else>
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
              :sub="cacheHit(totals)"
            />
            <StatTile
              label="Tokens out"
              :value="compact(totals.outputTokens)"
              sub="answers and reasoning"
            />
          </template>
        </div>

        <Card v-if="buckets.list.length > 1">
          <h2 class="text-base font-semibold">{{ buckets.byWeek ? 'By week' : 'By day' }}</h2>
          <p class="mt-0.5 text-xs text-fg-muted">
            {{ unit === 'money' ? 'Estimated spend' : 'Calls' }}
            {{ buckets.byWeek ? 'per week, each ending on the last day shown' : 'per day' }}; the
            line is the average. Tap a bar for its number.
          </p>
          <BarChart
            class="mt-3"
            :values="chartValues"
            :labels="buckets.list.map((b) => b.label)"
            :label="`${unit === 'money' ? 'Spend' : 'Calls'} ${buckets.byWeek ? 'per week' : 'per day'}, ${windowLabel}`"
            :format="chartFormat"
            :reference="chartAverage"
            :highlight="buckets.list.length - 1"
            :label-every="labelEvery"
            empty-label="nothing"
          />
        </Card>

        <Card v-if="byPurpose.length" :padded="false">
          <h2 class="px-4 pt-4 pb-2 text-base font-semibold">By purpose</h2>
          <ul class="divide-y divide-border">
            <li v-for="group in byPurpose" :key="group.key" class="px-4 py-3">
              <p class="flex items-baseline justify-between gap-3">
                <span class="text-base font-medium text-fg">{{ PURPOSE_LABELS[group.key] }}</span>
                <span class="shrink-0 text-base font-semibold text-fg tabular-nums">
                  {{ figure(group.totals) }}
                </span>
              </p>
              <ProgressBar
                class="mt-1.5"
                :value="purposeShare(group.totals)"
                :max="100"
                :label="`${PURPOSE_LABELS[group.key]}: ${Math.round(purposeShare(group.totals))}% of the total`"
              />
              <p class="mt-1 text-sm text-fg-muted">{{ line(group.totals) }}</p>
            </li>
          </ul>
        </Card>

        <Card v-if="data.models.length" :padded="false">
          <h2 class="px-4 pt-4 pb-2 text-base font-semibold">By model</h2>
          <ul class="divide-y divide-border">
            <li v-for="model in data.models" :key="model.model" class="px-4 py-3">
              <p class="flex items-baseline justify-between gap-3">
                <span class="truncate text-base font-medium text-fg">{{ model.model }}</span>
                <span class="shrink-0 text-base font-semibold text-fg tabular-nums">
                  {{
                    unit === 'money'
                      ? model.priced
                        ? pounds(model.costUsd)
                        : 'no price'
                      : plural(model.calls, 'call')
                  }}
                </span>
              </p>
              <p class="text-sm text-fg-muted">
                {{ plural(model.calls, 'call') }} · {{ compact(model.inputTokens) }} in ·
                {{ cacheHit(model) }} · {{ compact(model.outputTokens) }} out
              </p>
            </li>
          </ul>
        </Card>

        <Card v-if="byPerson.length" :padded="false">
          <h2 class="px-4 pt-4 pb-2 text-base font-semibold">By person</h2>
          <ul class="divide-y divide-border">
            <li v-for="group in byPerson" :key="group.key" class="px-4 py-3">
              <p class="flex items-baseline justify-between gap-3">
                <span class="truncate text-base font-medium text-fg">{{ group.key }}</span>
                <span class="shrink-0 text-base font-semibold text-fg tabular-nums">
                  {{ figure(group.totals) }}
                </span>
              </p>
              <ul class="mt-1.5 space-y-0.5">
                <li
                  v-for="row in group.rows"
                  :key="row.purpose"
                  class="flex items-baseline justify-between gap-3 text-xs text-fg-muted"
                >
                  <span class="shrink-0">{{ PURPOSE_LABELS[row.purpose] }}</span>
                  <span class="truncate text-right tabular-nums">
                    {{ figure(row) }} · {{ line(row) }}
                  </span>
                </li>
              </ul>
            </li>
          </ul>
        </Card>

        <Card v-else>
          <p class="text-sm text-fg-muted">
            No AI calls {{ period === 'today' ? 'today' : 'in this period' }}.
          </p>
        </Card>

        <Card v-if="data.billed.status === 'ok' && data.billed.lineItems.length" :padded="false">
          <h2 class="px-4 pt-4 pb-2 text-base font-semibold">OpenAI's line items</h2>
          <ul class="divide-y divide-border">
            <li
              v-for="item in data.billed.lineItems"
              :key="item.lineItem"
              class="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm"
            >
              <span class="min-w-0 truncate text-fg">{{ item.lineItem }}</span>
              <span class="shrink-0 font-semibold text-fg tabular-nums">
                {{ pounds(item.costUsd) }}
              </span>
            </li>
          </ul>
        </Card>

        <section class="space-y-2 px-1 text-xs text-fg-muted" aria-label="How this is worked out">
          <h2 class="text-sm font-semibold text-fg">How this is worked out</h2>
          <p>
            Each call is priced from the tokens OpenAI reported for it, at OpenAI's list prices on
            {{ formatDay(data.pricesAsOf) }} (cache hits at the cache rate, web searches at 1¢
            each), and turned into pounds at $1 = £{{ data.usdToGbp }}. Days run midnight to
            midnight in {{ data.timezone }}.
          </p>
          <p v-if="totals.estimatedCalls > 0">
            {{ plural(totals.estimatedCalls, 'call') }}
            {{ totals.estimatedCalls === 1 ? 'was' : 'were' }}
            logged before cache hits were counted (5 Nov). Their cache share is taken from later
            calls of the same kind, or assumed to be none where there are no later ones, which reads
            high.
          </p>
          <p v-if="totals.unpricedCalls > 0">
            {{ plural(totals.unpricedCalls, 'call') }} ran on a model with no listed price and
            {{ totals.unpricedCalls === 1 ? 'is' : 'are' }} left out of the money.
          </p>
          <p v-if="data.billed.status === 'off'">
            This is an estimate. To set it beside what OpenAI actually billed, give the server an
            OpenAI admin key as <code>OPENAI_ADMIN_KEY</code> (and <code>OPENAI_PROJECT_ID</code> to
            count one project only).
          </p>
          <p v-else>
            OpenAI's bill also counts anything else on the same
            {{ data.billed.status === 'ok' && data.billed.projectId ? 'project' : 'organisation' }}
            (local runs, smoke tests), and runs on UTC days.
          </p>
        </section>
      </div>
    </div>
  </AppShell>
</template>
