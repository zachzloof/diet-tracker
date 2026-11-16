import {
  addDays,
  localDay,
  NO_FLAGS,
  portionOf,
  referenceGrams,
  roundFoodGroupServes,
  roundNutrientVector,
  startOfLocalDay,
  targetValue,
  waterEntryInput,
  type LogEntryInput,
  type ProfileInput,
  type SavedMealItem,
  type WorkoutInput,
  type WorkoutSet,
} from '@diet-tracker/shared'
import { eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { hashPassword } from '../apps/api/src/auth/password.js'
import { closeDb, db } from '../apps/api/src/db/client.js'
import { EXERCISE_CATALOGUE } from '../apps/api/src/db/exercise-catalogue.js'
import { foods, targetVersions, users, weightEntries } from '../apps/api/src/db/schema/index.js'
import { createFood } from '../apps/api/src/log/foods-service.js'
import { createEntries } from '../apps/api/src/log/log-service.js'
import { createSavedMeal } from '../apps/api/src/log/saved-meals-service.js'
import { saveProfile } from '../apps/api/src/profile/profile-service.js'
import { upsertWorkout } from '../apps/api/src/training/workouts-service.js'
import { PERSONA } from './config.js'
import { FOOD_LOG } from './data/days.js'
import { LIBRARY_FOODS, PORTIONS, SAVED_MEALS } from './data/foods.js'
import {
  SKIPPED,
  SPLIT,
  TRAINING_WEEKS,
  UPPER_HEAVY,
  weighIns,
  type PlannedLift,
  type PlannedSession,
} from './data/training.js'

/**
 * Fills the (empty, freshly migrated) demo database with one believable person: Jamie, 29,
 * on a lean gain, lifting four days a week. Thirteen weeks of weigh-ins and gym sessions,
 * three weeks of meals, a small food library and saved meals, and a today that is waiting
 * for dinner and the last lift of the session.
 *
 * It runs on the demo clock (clock.mjs), so "today" is DEMO_NOW's day, and it goes through
 * the app's own services, so every total, score and bodyweight load is worked out by the
 * same code the app runs. Lines starting `[seed]` are echoed by the pipeline.
 */

const PROFILE: ProfileInput = {
  sex: 'male',
  dob: '1997-03-22',
  heightCm: 180,
  weightKg: 78,
  bodyFatPct: null,
  goal: 'gain',
  pace: 'lean',
  goalWeightKg: 82,
  activity: 'moderate',
  trainingType: 'strength',
  trainingDaysPerWeek: 4,
  dietPattern: 'omnivore',
  allergies: [],
  dislikes: ['mushrooms'],
  timezone: PERSONA.timezone,
  units: 'metric',
  flags: NO_FLAGS,
  healthConsent: true,
}

const TZ = PERSONA.timezone
const HOUR_MS = 60 * 60 * 1000

function say(message: string): void {
  console.log(`[seed] ${message}`)
}

/** The instant of a local clock time (24 h, fractional hours) on a local day. */
function at(day: string, hour: number): Date {
  return new Date(startOfLocalDay(day, TZ).getTime() + Math.round(hour * HOUR_MS))
}

async function seedPerson(now: Date): Promise<{ userId: string; today: string }> {
  const userId = uuidv7()
  const today = localDay(now, TZ)
  const joined = at(addDays(today, -92), 19)
  await db.insert(users).values({
    id: userId,
    email: PERSONA.email,
    passwordHash: await hashPassword(PERSONA.password),
    createdAt: joined,
    updatedAt: joined,
  })

  const result = await saveProfile(userId, PROFILE, now)
  // Jamie has been on this plan since joining, so every past day is scored against it.
  await db
    .update(targetVersions)
    .set({ effectiveFrom: addDays(today, -92) })
    .where(eq(targetVersions.userId, userId))
  say(
    `targets: ${targetValue(result.version.effective, 'energy_kcal')} kcal, ` +
      `${targetValue(result.version.effective, 'protein_g')} g protein`,
  )
  return { userId, today }
}

async function seedWeights(userId: string, today: string): Promise<number> {
  const points = weighIns()
  for (const { daysAgo, weightKg } of points) {
    const day = addDays(today, -daysAgo)
    await db
      .insert(weightEntries)
      .values({ id: uuidv7(), userId, day, weightKg, createdAt: at(day, 7) })
      .onConflictDoUpdate({ target: [weightEntries.userId, weightEntries.day], set: { weightKg } })
  }
  return points.length
}

async function seedLibrary(userId: string, today: string): Promise<void> {
  const added = at(addDays(today, -60), 20)
  for (const food of LIBRARY_FOODS) {
    await createFood(userId, food, { source: 'manual', verified: true, now: added })
  }
  const library = await db.select().from(foods).where(eq(foods.userId, userId))
  for (const meal of SAVED_MEALS) {
    const items: SavedMealItem[] = meal.items.map(({ food: name, grams }) => {
      const food = library.find((candidate) => candidate.name === name)
      if (!food) throw new Error(`saved meal ${meal.name}: no library food called ${name}`)
      const portion = portionOf(food, grams)
      const perServing = food.basis === 'per_serving'
      return {
        name: food.name,
        quantity: perServing ? grams / referenceGrams(food) : grams,
        unit: perServing ? (food.servingLabel ?? 'serving') : 'g',
        grams,
        nutrients: roundNutrientVector(portion.nutrients),
        foodGroups: roundFoodGroupServes(portion.foodGroups),
        foodId: food.id,
      }
    })
    await createSavedMeal(userId, { name: meal.name, items })
  }
}

async function seedFoodLog(userId: string, today: string): Promise<void> {
  const summary: string[] = []
  for (const { offset, sittings } of FOOD_LOG) {
    const day = addDays(today, offset)
    let kcal = 0
    let protein = 0
    for (const sitting of sittings) {
      const loggedAt = at(day, sitting.hour)
      const entries: LogEntryInput[] = sitting.items.map((item) => {
        if (typeof item !== 'string') return waterEntryInput(item.waterMl)
        const portion = PORTIONS[item]
        kcal += portion.nutrients.energy_kcal
        protein += portion.nutrients.protein_g
        return portion
      })
      await createEntries(
        userId,
        { day, meal: sitting.meal, loggedAt: loggedAt.toISOString(), entries },
        loggedAt,
      )
    }
    if (offset >= -7) summary.push(`${offset}: ${Math.round(kcal)} kcal ${Math.round(protein)} g`)
  }
  say(`food, last days (offset: energy protein): ${summary.join(' | ')}`)
}

function plannedWeight(lift: PlannedLift, week: number): number | null {
  if (lift.startKg === null) return null
  return lift.startKg + Math.floor(week / lift.everyWeeks) * lift.stepKg
}

/** The sets of one lift in training week `week` (0 is the oldest). */
function setsFor(lift: PlannedLift, week: number): WorkoutSet[] {
  const weightKg = plannedWeight(lift, week)
  // Bodyweight work gains a rep every few weeks; bar work loses one on the last set the
  // week the weight goes up.
  const baseReps = lift.startKg === null ? lift.reps - 2 + Math.floor(week / 4) : lift.reps
  const heavier = lift.startKg !== null && week > 0 && week % lift.everyWeeks === 0
  return Array.from({ length: lift.sets }, (_, index) => ({
    id: uuidv7(),
    weightKg,
    reps: baseReps - (index === lift.sets - 1 && (heavier || lift.startKg === null) ? 1 : 0),
    durationS: null,
    distanceM: null,
    rpe: null,
    completed: true,
  }))
}

function sessionInput(session: PlannedSession, week: number, today: string): WorkoutInput {
  const weeksAgo = TRAINING_WEEKS - 1 - week
  const day = addDays(today, -7 * weeksAgo - session.daysBeforeThursday)
  // A few minutes either side of the usual time, the same on every run.
  const startedAt = at(day, session.startHour + ((week * 7) % 5) / 20)
  const minutes = session.minutes + ((week * 3) % 7) - 3
  return {
    day,
    startedAt: startedAt.toISOString(),
    endedAt: new Date(startedAt.getTime() + minutes * 60_000).toISOString(),
    title: session.title,
    notes: '',
    feel: 3 + ((week + session.daysBeforeThursday) % 3),
    exercises: session.lifts.map((lift) => {
      const exercise = EXERCISE_CATALOGUE.find((candidate) => candidate.name === lift.exercise)
      if (!exercise) throw new Error(`${lift.exercise} is not in the exercise catalogue`)
      return {
        id: uuidv7(),
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        notes: '',
        sets: setsFor(lift, week),
      }
    }),
  }
}

/** How many of today's lifts are already done when the video opens; the rest wait unticked. */
const LIFTS_DONE_TODAY = 4

async function seedTraining(userId: string, today: string, now: Date): Promise<number> {
  const sessions: { input: WorkoutInput; savedAt: Date }[] = []
  for (let week = 0; week < TRAINING_WEEKS; week += 1) {
    const weeksAgo = TRAINING_WEEKS - 1 - week
    for (const session of SPLIT) {
      if (SKIPPED.has(`${weeksAgo}:${session.title}`)) continue
      const input = sessionInput(session, week, today)
      if (input.day > today) continue
      if (input.day === today) continue // today's is built below, still open
      sessions.push({ input, savedAt: new Date(input.endedAt ?? input.startedAt) })
    }
  }
  sessions.sort((a, b) => a.input.startedAt.localeCompare(b.input.startedAt))

  // Today: started 57 minutes ago, four lifts ticked off, the last one to go.
  const open = sessionInput(UPPER_HEAVY, TRAINING_WEEKS - 1, today)
  open.startedAt = new Date(now.getTime() - 57 * 60_000).toISOString()
  open.endedAt = null
  open.feel = null
  open.exercises.forEach((block, index) => {
    if (index < LIFTS_DONE_TODAY) return
    for (const set of block.sets) set.completed = false
  })
  sessions.push({ input: open, savedAt: now })

  for (const { input, savedAt } of sessions) {
    await upsertWorkout(userId, uuidv7(), input, savedAt)
  }
  return sessions.length
}

try {
  const now = new Date()
  const { userId, today } = await seedPerson(now)
  const weights = await seedWeights(userId, today)
  await seedLibrary(userId, today)
  await seedFoodLog(userId, today)
  const sessions = await seedTraining(userId, today, now)
  say(
    `${PERSONA.email}: today is ${today}, ${weights} weigh-ins, ${FOOD_LOG.length} days of food, ` +
      `${LIBRARY_FOODS.length} library foods, ${SAVED_MEALS.length} saved meals, ${sessions} gym sessions`,
  )
  await closeDb()
} catch (error) {
  console.error('[seed] failed', error)
  await closeDb().catch(() => undefined)
  process.exit(1)
}
