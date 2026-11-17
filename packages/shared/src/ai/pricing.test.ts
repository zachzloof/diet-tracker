import { describe, expect, it } from 'vitest'
import { aiCostWindow, cachedShare, groupAiCosts, sumAiCosts, totalAiCostUsd } from './costs.js'
import { AI_PRICES_AS_OF, aiCostUsd, modelPrice, pricedModelName } from './pricing.js'

describe('modelPrice', () => {
  it('reads a dated snapshot as its model and matches nothing else loosely', () => {
    expect(modelPrice('gpt-5.5')).toEqual({ input: 5, cachedInput: 0.5, output: 30 })
    expect(modelPrice('gpt-5.5-2026-04-23')).toEqual(modelPrice('gpt-5.5'))
    expect(modelPrice('gpt-5-mini-2025-08-07')).toEqual(modelPrice('gpt-5-mini'))
    expect(modelPrice('gpt-5-mini')).not.toEqual(modelPrice('gpt-5'))
    expect(modelPrice('gpt-5.5-turbo')).toBeNull()
    expect(modelPrice('fake-model')).toBeNull()
    expect(AI_PRICES_AS_OF).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('aiCostUsd', () => {
  it('prices a coach turn on gpt-5.5: fresh input, cached input, output', () => {
    // 5,500 in of which 4,000 cached, 150 out:
    // 1,500 × $5/M + 4,000 × $0.50/M = $0.0075 + $0.002; 150 × $30/M = $0.0045.
    const cost = aiCostUsd('gpt-5.5-2026-04-23', {
      inputTokens: 5500,
      cachedInputTokens: 4000,
      outputTokens: 150,
      webSearchCalls: 0,
    })
    expect(cost?.inputUsd).toBeCloseTo(0.0095, 10)
    expect(cost?.outputUsd).toBeCloseTo(0.0045, 10)
    expect(cost?.searchUsd).toBe(0)
  })

  it('adds a cent per web search and charges uncached input in full', () => {
    const cost = aiCostUsd('gpt-5.5', {
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      outputTokens: 1_000_000,
      webSearchCalls: 3,
    })
    expect(cost).toEqual({ inputUsd: 5, outputUsd: 30, searchUsd: 0.03 })
  })

  it('charges cached tokens at the input rate on a model with no cached rate', () => {
    const cost = aiCostUsd('gpt-5.5-pro', {
      inputTokens: 1_000_000,
      cachedInputTokens: 1_000_000,
      outputTokens: 0,
      webSearchCalls: 0,
    })
    expect(cost?.inputUsd).toBe(30)
  })

  it('never counts more cached tokens than there were input tokens', () => {
    const cost = aiCostUsd('gpt-5.5', {
      inputTokens: 1000,
      cachedInputTokens: 5000,
      outputTokens: 0,
      webSearchCalls: 0,
    })
    expect(cost?.inputUsd).toBeCloseTo(0.0005, 10)
  })

  it('is null for a model with no listed price, never a guess', () => {
    expect(
      aiCostUsd('some-new-model', {
        inputTokens: 1000,
        cachedInputTokens: 0,
        outputTokens: 1000,
        webSearchCalls: 1,
      }),
    ).toBeNull()
  })
})

describe('sumAiCosts', () => {
  it('adds tokens, money and unpriced calls across rows', () => {
    const row = {
      calls: 2,
      failed: 1,
      inputTokens: 100,
      cachedInputTokens: 40,
      outputTokens: 10,
      webSearchCalls: 1,
      inputCostUsd: 0.5,
      outputCostUsd: 0.25,
      searchCostUsd: 0.01,
      unpricedCalls: 1,
      estimatedCalls: 1,
    }
    const totals = sumAiCosts([row, row])
    expect(totals).toEqual({
      calls: 4,
      failed: 2,
      inputTokens: 200,
      cachedInputTokens: 80,
      outputTokens: 20,
      webSearchCalls: 2,
      inputCostUsd: 1,
      outputCostUsd: 0.5,
      searchCostUsd: 0.02,
      unpricedCalls: 2,
      estimatedCalls: 2,
    })
    expect(totalAiCostUsd(totals)).toBeCloseTo(1.52, 10)
  })
})

describe('pricedModelName', () => {
  it('drops a snapshot date and nothing else', () => {
    expect(pricedModelName('gpt-5.5-2026-04-23')).toBe('gpt-5.5')
    expect(pricedModelName('gpt-5-mini')).toBe('gpt-5-mini')
  })
})

describe('cachedShare', () => {
  it('is cached over input from the calls that recorded it, null with nothing to go on', () => {
    // Coach rounds after 2026-11-05: 4,000 of every 5,500 input tokens were cache hits.
    expect(cachedShare({ inputTokens: 55_000, cachedInputTokens: 40_000 })).toBeCloseTo(0.7273, 4)
    expect(cachedShare({ inputTokens: 0, cachedInputTokens: 0 })).toBeNull()
    expect(cachedShare({ inputTokens: 10, cachedInputTokens: 50 })).toBe(1)
  })

  it('brings an old coach round priced as uncached down to its likely cost', () => {
    // 5,500 in with no cache count: uncached it reads $0.0275 of input; at the 72.7% share
    // seen since, 4,000 cached and 1,500 fresh, it reads $0.0095, like the recorded rounds.
    const share = cachedShare({ inputTokens: 55_000, cachedInputTokens: 40_000 }) ?? 0
    const usage = { inputTokens: 5500, outputTokens: 0, webSearchCalls: 0 }
    const uncached = aiCostUsd('gpt-5.5', { ...usage, cachedInputTokens: 0 })
    const estimated = aiCostUsd('gpt-5.5', {
      ...usage,
      cachedInputTokens: Math.round(5500 * share),
    })
    expect(uncached?.inputUsd).toBeCloseTo(0.0275, 10)
    expect(estimated?.inputUsd).toBeCloseTo(0.0095, 10)
  })
})

describe('aiCostWindow', () => {
  it('ends today and runs the period back, today counting as one of its days', () => {
    expect(aiCostWindow('today', '2026-11-17', '2026-09-25')).toEqual({
      from: '2026-11-17',
      to: '2026-11-17',
    })
    expect(aiCostWindow('7d', '2026-11-17', null)).toEqual({ from: '2026-11-11', to: '2026-11-17' })
    expect(aiCostWindow('30d', '2026-11-17', null).from).toBe('2026-10-19')
  })

  it('runs all from the first call, or today when there is none', () => {
    expect(aiCostWindow('all', '2026-11-17', '2026-09-25').from).toBe('2026-09-25')
    expect(aiCostWindow('all', '2026-11-17', null).from).toBe('2026-11-17')
  })
})

describe('groupAiCosts', () => {
  it('puts the most expensive group first, even with fewer calls', () => {
    const base = {
      userId: null,
      email: null,
      failed: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      webSearchCalls: 0,
      outputCostUsd: 0,
      searchCostUsd: 0,
      unpricedCalls: 0,
      estimatedCalls: 0,
    }
    const groups = groupAiCosts(
      [
        { ...base, purpose: 'estimate', calls: 10, inputCostUsd: 0.1 },
        { ...base, purpose: 'coach', calls: 3, inputCostUsd: 0.5 },
      ],
      (row) => row.purpose,
    )
    expect(groups.map((g) => g.key)).toEqual(['coach', 'estimate'])
  })
})
