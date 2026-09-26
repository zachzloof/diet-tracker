import {
  NO_FLAGS,
  computeTargets,
  currentStreak,
  evaluateDay,
  findGaps,
  storedWeeklyReviewSchema,
  summariseWeek,
  weeklyReviewSchema,
  type Profile,
  type ScoredDay,
  type WeekStatsResponse,
} from '@diet-tracker/shared'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { seedWeekTotals } from '../db/seed-weeks.js'
import { buildTargetInput } from '../profile/profile-service.js'
import { WEEKLY_REVIEW_SYSTEM_PROMPT, buildWeeklyReviewUserMessage } from './weekly-review.js'

const TODAY = '2026-09-26'

const finn: Profile = {
  sex: 'male',
  dob: '1998-06-15',
  heightCm: 178,
  weightKg: 75,
  bodyFatPct: null,
  goal: 'gain',
  pace: 'lean',
  goalWeightKg: 80,
  activity: 'high',
  trainingType: 'combat',
  trainingDaysPerWeek: 6,
  dietPattern: 'omnivore',
  allergies: [],
  dislikes: ['liver'],
  timezone: 'Europe/London',
  units: 'metric',
  flags: NO_FLAGS,
  createdAt: '2026-09-25T10:00:00.000Z',
  updatedAt: '2026-09-25T10:00:00.000Z',
}

/** Finn's seeded week scored in memory, the same way the smoke script builds it. */
export function statsFromSeed(profile: Profile, email: string, today: string): WeekStatsResponse {
  const targets = computeTargets(buildTargetInput(profile, today))
  const days: ScoredDay[] = seedWeekTotals(email, today).map(({ day, totals }) => ({
    day,
    score: evaluateDay(totals, targets),
  }))
  const summary = summariseWeek(days)
  return {
    start: days[0]!.day,
    end: today,
    today,
    days,
    daysLogged: summary.daysLogged,
    daysMet: summary.daysMet,
    streak: currentStreak(days, today),
    gaps: findGaps(
      days.map((d) => d.score),
      profile,
    ),
  }
}

describe('weekly-review prompt', () => {
  it('tells the model to use only the supplied numbers and to take the top two gaps', () => {
    expect(WEEKLY_REVIEW_SYSTEM_PROMPT).toMatch(/Base every claim on the supplied numbers/)
    expect(WEEKLY_REVIEW_SYSTEM_PROMPT).toMatch(/top two gaps/)
    expect(WEEKLY_REVIEW_SYSTEM_PROMPT).toMatch(/at most 170 words/)
  })

  it('lists every day with its numbers and verdict, the averages, the targets and the ranked gaps', () => {
    const stats = statsFromSeed(finn, 'finn@example.com', TODAY)
    const targets = computeTargets(buildTargetInput(finn, TODAY))
    const message = buildWeeklyReviewUserMessage(finn, stats, targets)
    expect(message).toMatch(/Male, age 28, 75 kg, goal: gain muscle/)
    expect(message).toMatch(/Diet pattern: Omnivore/)
    expect(message).toMatch(/Dislikes: liver/)
    expect(message).toMatch(/WEEK \(Sun 20 Sep to Sat 26 Sep; today is Sat 26 Sep\)/)
    expect(message).toMatch(/Days logged: 6 of 7\. Days met: 4\. Current streak: 4 days\./)
    expect(message).toMatch(
      /- Sun 20 Sep: energy 2570 \/ 3250 kcal, protein 108 \/ 150 g, .*: missed \(energy short, protein short, carbs short, sodium over, water short, alcohol over\)/,
    )
    expect(message).toMatch(/- Tue 22 Sep: energy 2700 \/ 3250 kcal, .*: met/)
    expect(message).toMatch(/- Sat 26 Sep: today, in progress \(700 kcal so far\)/)
    expect(message).toMatch(/- Energy: 2770 \/ 3250 kcal \(85%\), met on 2 of 6 days/)
    expect(message).toMatch(/- Vegetables: 2\.5 \/ 6 serves \(42%\), met on 0 of 6 days/)
    expect(message).toMatch(/KEY TARGETS\n- Energy: 3250 kcal\./)
    expect(message).toMatch(
      /1\. \[medium\] Not enough vegetables: Vegetables were under 60% of target on 4 of 6 logged days/,
    )
    expect(message).toMatch(/2\. \[medium\] Fibre short/)
    expect(message).toMatch(/Suggestions: Frozen mixed vegetables/)
    expect(message).not.toMatch(/liver/i)
  })
})

describe('WeeklyReview schema', () => {
  it('accepts the recorded fixture and rejects a missing field', () => {
    const fixture: unknown = JSON.parse(
      readFileSync(new URL('./__fixtures__/weekly-review-finn.json', import.meta.url), 'utf8'),
    )
    const parsed = weeklyReviewSchema.parse((fixture as { response: unknown }).response)
    expect(parsed.changes).toHaveLength(2)
    expect(parsed.wins.length).toBeGreaterThanOrEqual(1)
    expect(parsed.wins.length).toBeLessThanOrEqual(3)
    expect(
      storedWeeklyReviewSchema.safeParse({
        ...parsed,
        model: 'gpt-5.5',
        generatedAt: '2026-09-26T10:00:00.000Z',
        weekEnd: TODAY,
        daysLogged: 6,
      }).success,
    ).toBe(true)
    const { encouragement: _dropped, ...missing } = parsed
    expect(weeklyReviewSchema.safeParse(missing).success).toBe(false)
  })
})
