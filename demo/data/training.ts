/**
 * Thirteen weeks of Jamie's training: an upper/lower split, four days a week, with weights that
 * creep up the way they do on a steady lean gain. The demo's today is a Thursday, the week's
 * heavy bench day, and today's session is still open with the last lift to go.
 */

export interface PlannedLift {
  exercise: string
  sets: number
  reps: number
  /** Weight on the bar in week 1, kilograms. Null for bodyweight work. */
  startKg: number | null
  /** Added every `everyWeeks` weeks. */
  stepKg: number
  everyWeeks: number
}

export interface PlannedSession {
  title: string
  /** Days before the Thursday of the same week block: 0 Thu, 2 Tue, 3 Mon, 6 the Friday before. */
  daysBeforeThursday: number
  /** Local start, 24 h. */
  startHour: number
  minutes: number
  lifts: PlannedLift[]
}

const lift = (
  exercise: string,
  sets: number,
  reps: number,
  startKg: number | null,
  stepKg = 2.5,
  everyWeeks = 2,
): PlannedLift => ({ exercise, sets, reps, startKg, stepKg, everyWeeks })

export const UPPER_HEAVY: PlannedSession = {
  title: 'Upper: heavy',
  daysBeforeThursday: 0,
  startHour: 17.75,
  minutes: 62,
  lifts: [
    lift('Barbell bench press', 4, 6, 70, 2.5, 2),
    lift('Barbell row', 4, 8, 60, 2.5, 3),
    lift('Overhead press', 3, 8, 40, 2.5, 4),
    lift('Lat pulldown', 3, 10, 52.5, 2.5, 3),
    lift('Triceps pushdown', 3, 12, 22.5, 2.5, 4),
  ],
}

export const SPLIT: PlannedSession[] = [
  {
    title: 'Lower: squat',
    daysBeforeThursday: 3,
    startHour: 18,
    minutes: 58,
    lifts: [
      lift('Barbell back squat', 4, 5, 95, 2.5, 2),
      lift('Romanian deadlift', 3, 8, 80, 2.5, 3),
      lift('Leg press', 3, 10, 140, 5, 2),
      lift('Standing calf raise', 3, 12, 60, 5, 4),
    ],
  },
  {
    title: 'Upper: volume',
    daysBeforeThursday: 2,
    startHour: 18.25,
    minutes: 55,
    lifts: [
      lift('Incline dumbbell bench press', 4, 8, 24, 2, 4),
      lift('Pull-up', 4, 8, null),
      lift('Seated dumbbell shoulder press', 3, 10, 18, 2, 5),
      lift('Seated cable row', 3, 10, 55, 2.5, 3),
      lift('Dumbbell curl', 3, 12, 12, 2, 6),
    ],
  },
  UPPER_HEAVY,
  {
    title: 'Lower: deadlift',
    daysBeforeThursday: 6,
    startHour: 17.5,
    minutes: 52,
    lifts: [
      lift('Conventional deadlift', 3, 5, 120, 5, 2),
      lift('Bulgarian split squat', 3, 10, 16, 2, 4),
      lift('Leg extension', 3, 12, 50, 2.5, 3),
      lift('Lying leg curl', 3, 12, 37.5, 2.5, 4),
      lift('Hanging leg raise', 3, 12, null),
    ],
  },
]

export const TRAINING_WEEKS = 13

/** Sessions that never happened: `${weeksAgo}:${title}`. A missed Friday and a week away. */
export const SKIPPED = new Set(['4:Lower: deadlift', '7:Upper: volume', '9:Lower: squat'])

/**
 * Weigh-ins, kilograms: about 0.2 kg a week up over the thirteen weeks, weighed most mornings
 * that matter. `daysAgo` 0 is today.
 */
export function weighIns(): { daysAgo: number; weightKg: number }[] {
  const points: { daysAgo: number; weightKg: number }[] = []
  for (let daysAgo = 91; daysAgo >= 0; daysAgo -= 1) {
    // Weighed roughly five days in seven; never skipped today.
    if (daysAgo !== 0 && (daysAgo * 7) % 11 < 3) continue
    const trend = 78 - (daysAgo / 7) * 0.21
    const wobble = Math.sin(daysAgo * 1.7) * 0.22 + Math.cos(daysAgo * 0.6) * 0.12
    points.push({ daysAgo, weightKg: daysAgo === 0 ? 78 : Math.round((trend + wobble) * 10) / 10 })
  }
  return points
}
