import {
  portionOf,
  referenceGrams,
  roundFoodGroupServes,
  roundNutrientVector,
  targetValue,
  type SavedMealItem,
} from '@diet-tracker/shared'
import { eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { hashPassword } from '../auth/password.js'
import { logger } from '../logger.js'
import { createFood } from '../log/foods-service.js'
import { createSavedMeal } from '../log/saved-meals-service.js'
import { saveProfile } from '../profile/profile-service.js'
import { closeDb, db } from './client.js'
import { foods, profiles, savedMeals, users } from './schema/index.js'
import { SEED_FOODS, SEED_MEALS, SEED_USERS } from './seed-data.js'
import { backdateTargets, seedEarlierWeek, seedWeights } from './seed-progress.js'
import { seedWeek } from './seed-weeks.js'

/**
 * Creates Finn and Tess with their profiles, first target version, a few library foods, a
 * saved meal and a week of logged meals (slice 4). Idempotent: existing accounts, profiles,
 * libraries, meals and logs are left alone, so re-running never overwrites a change you made
 * by hand in the app.
 */
async function seed(): Promise<void> {
  for (const { email, password, profile } of SEED_USERS) {
    const inserted = await db
      .insert(users)
      .values({ id: uuidv7(), email, passwordHash: await hashPassword(password) })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id })
    const user =
      inserted[0] ??
      (await db.select({ id: users.id }).from(users).where(eq(users.email, email)))[0]
    if (!user) throw new Error(`seed user ${email} missing after insert`)
    logger.info({ email, created: inserted.length > 0 }, 'seed user')

    const existing = await db
      .select({ userId: profiles.userId })
      .from(profiles)
      .where(eq(profiles.userId, user.id))
    if (existing.length > 0) {
      logger.info({ email }, 'seed profile already present, left alone')
    } else {
      const result = await saveProfile(user.id, profile)
      logger.info(
        {
          email,
          energyKcal: targetValue(result.version.effective, 'energy_kcal'),
          proteinG: targetValue(result.version.effective, 'protein_g'),
        },
        'seed profile and targets',
      )
    }

    const library = await db
      .select({ id: foods.id })
      .from(foods)
      .where(eq(foods.userId, user.id))
      .limit(1)
    if (library.length > 0) {
      logger.info({ email }, 'seed foods already present, left alone')
    } else {
      for (const food of SEED_FOODS[email] ?? []) {
        await createFood(user.id, food, { source: 'manual', verified: true })
      }
      logger.info({ email, count: SEED_FOODS[email]?.length ?? 0 }, 'seed foods')
    }

    const meals = await seedMeals(user.id, email)
    logger.info(
      { email, meals },
      meals > 0 ? 'seed saved meals' : 'seed saved meals already present, left alone',
    )

    const entries = await seedWeek(user.id, email, profile.timezone)
    logger.info(
      { email, entries },
      entries > 0 ? 'seed week of meals' : 'seed log already present, left alone',
    )

    // Slice 5: a second week, two weeks of weigh-ins and a backdated first version so the
    // recalibration check is due (Tess gets a proposal, Finn is on track).
    const earlier = await seedEarlierWeek(user.id, email, profile.timezone)
    const weights = await seedWeights(user.id, email, profile.timezone)
    const backdated = await backdateTargets(user.id, profile.timezone)
    logger.info({ email, earlier, weights, backdated }, 'seed progress history')
  }
}

/** The persona's saved meals, each ingredient a portion of one of their library foods. */
async function seedMeals(userId: string, email: string): Promise<number> {
  const existing = await db
    .select({ id: savedMeals.id })
    .from(savedMeals)
    .where(eq(savedMeals.userId, userId))
    .limit(1)
  if (existing.length > 0) return 0
  const library = await db.select().from(foods).where(eq(foods.userId, userId))
  let created = 0
  for (const meal of SEED_MEALS[email] ?? []) {
    const items: SavedMealItem[] = []
    for (const { food: name, grams } of meal.items) {
      const food = library.find((candidate) => candidate.name === name)
      if (!food) continue
      const portion = portionOf(food, grams)
      const perServing = food.basis === 'per_serving'
      items.push({
        name: food.name,
        quantity: perServing ? grams / referenceGrams(food) : grams,
        unit: perServing ? (food.servingLabel ?? 'serving') : 'g',
        grams,
        nutrients: roundNutrientVector(portion.nutrients),
        foodGroups: roundFoodGroupServes(portion.foodGroups),
        foodId: food.id,
      })
    }
    if (items.length === 0) continue
    await createSavedMeal(userId, { name: meal.name, items })
    created += 1
  }
  return created
}

try {
  await seed()
  await closeDb()
} catch (error) {
  logger.error({ err: error }, 'seed failed')
  await closeDb().catch(() => undefined)
  process.exit(1)
}
