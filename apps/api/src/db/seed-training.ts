import { addDays, localDay, type WorkoutInput, type WorkoutSet } from '@diet-tracker/shared'
import { eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { upsertWorkout } from '../training/workouts-service.js'
import { db } from './client.js'
import { EXERCISE_CATALOGUE } from './exercise-catalogue.js'
import { workouts } from './schema/index.js'

/**
 * Slice 11a seed: a few finished gym sessions per persona so the coach's gym briefing,
 * `get_lift_history` and the lift page have something to agree on. Finn squats three times
 * over three weeks (100, 102.5, 105 kg × 5), so on the default "kg lifted" basis his best is
 * 525 kg lifted, up 25 kg (5%) from the first session, and this week's squat beats last
 * week's by 12.5 kg lifted. Idempotent: an account with any session is left alone.
 */

interface SeedBlock {
  exercise: string
  /** `[weightKg, reps]` per working set. */
  sets: [number | null, number][]
}

interface SeedSession {
  /** 0 is today, -1 yesterday, and so on. */
  offset: number
  title: string
  blocks: SeedBlock[]
}

const SEED_SESSIONS: Record<string, SeedSession[]> = {
  'finn@example.com': [
    {
      offset: -20,
      title: 'Legs',
      blocks: [
        {
          exercise: 'Barbell back squat',
          sets: [
            [100, 5],
            [100, 5],
            [100, 5],
          ],
        },
        {
          exercise: 'Romanian deadlift',
          sets: [
            [80, 8],
            [80, 8],
            [80, 8],
          ],
        },
      ],
    },
    {
      offset: -16,
      title: 'Push',
      blocks: [
        {
          exercise: 'Barbell bench press',
          sets: [
            [70, 5],
            [70, 5],
            [70, 5],
          ],
        },
        {
          exercise: 'Overhead press',
          sets: [
            [45, 8],
            [45, 8],
            [45, 8],
          ],
        },
      ],
    },
    {
      offset: -13,
      title: 'Legs',
      blocks: [
        {
          exercise: 'Barbell back squat',
          sets: [
            [102.5, 5],
            [102.5, 5],
            [102.5, 5],
          ],
        },
        {
          exercise: 'Romanian deadlift',
          sets: [
            [85, 8],
            [85, 8],
            [85, 8],
          ],
        },
      ],
    },
    {
      offset: -9,
      title: 'Push',
      blocks: [
        {
          exercise: 'Barbell bench press',
          sets: [
            [72.5, 5],
            [72.5, 5],
            [72.5, 5],
          ],
        },
        {
          exercise: 'Overhead press',
          sets: [
            [47.5, 8],
            [47.5, 8],
            [47.5, 8],
          ],
        },
      ],
    },
    {
      offset: -6,
      title: 'Legs',
      blocks: [
        {
          exercise: 'Barbell back squat',
          sets: [
            [105, 5],
            [105, 5],
            [105, 5],
          ],
        },
        {
          exercise: 'Romanian deadlift',
          sets: [
            [85, 8],
            [85, 8],
            [85, 8],
          ],
        },
      ],
    },
    {
      offset: -3,
      title: 'Pull',
      blocks: [
        {
          exercise: 'Barbell row',
          sets: [
            [60, 8],
            [60, 8],
            [60, 8],
          ],
        },
      ],
    },
    {
      offset: -2,
      title: 'Push',
      blocks: [
        {
          exercise: 'Barbell bench press',
          sets: [
            [75, 5],
            [75, 5],
            [75, 5],
          ],
        },
        {
          exercise: 'Overhead press',
          sets: [
            [50, 8],
            [50, 8],
            [50, 8],
          ],
        },
      ],
    },
  ],
  'tess@example.com': [
    {
      offset: -11,
      title: 'Full body',
      blocks: [
        {
          exercise: 'Goblet squat',
          sets: [
            [14, 12],
            [14, 12],
            [14, 12],
          ],
        },
        {
          exercise: 'Barbell row',
          sets: [
            [30, 10],
            [30, 10],
          ],
        },
      ],
    },
    {
      offset: -4,
      title: 'Full body',
      blocks: [
        {
          exercise: 'Goblet squat',
          sets: [
            [16, 12],
            [16, 12],
            [16, 12],
          ],
        },
        {
          exercise: 'Barbell row',
          sets: [
            [32.5, 10],
            [32.5, 10],
          ],
        },
      ],
    },
  ],
}

function set(weightKg: number | null, reps: number): WorkoutSet {
  return {
    id: uuidv7(),
    weightKg,
    reps,
    durationS: null,
    distanceM: null,
    rpe: null,
    completed: true,
  }
}

/** The sessions as `WorkoutInput` documents relative to `today`, oldest first. No database. */
export function seedSessionInputs(email: string, today: string): WorkoutInput[] {
  return (SEED_SESSIONS[email] ?? []).map(({ offset, title, blocks }) => {
    const day = addDays(today, offset)
    const startedAt = new Date(`${day}T17:30:00.000Z`)
    return {
      day,
      startedAt: startedAt.toISOString(),
      endedAt: new Date(startedAt.getTime() + 55 * 60_000).toISOString(),
      title,
      notes: '',
      feel: 4,
      exercises: blocks.map((block) => {
        const exercise = EXERCISE_CATALOGUE.find((e) => e.name === block.exercise)
        if (!exercise) throw new Error(`seed exercise ${block.exercise} is not in the catalogue`)
        return {
          id: uuidv7(),
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          notes: '',
          sets: block.sets.map(([weightKg, reps]) => set(weightKg, reps)),
        }
      }),
    }
  })
}

export async function seedWorkouts(
  userId: string,
  email: string,
  timeZone: string,
  now: Date = new Date(),
): Promise<number> {
  const existing = await db
    .select({ id: workouts.id })
    .from(workouts)
    .where(eq(workouts.userId, userId))
    .limit(1)
  if (existing.length > 0) return 0
  const today = localDay(now, timeZone)
  let count = 0
  for (const input of seedSessionInputs(email, today)) {
    await upsertWorkout(userId, uuidv7(), input, new Date(input.endedAt ?? input.startedAt))
    count += 1
  }
  return count
}
