import {
  MEAL_LABELS,
  coachToolArgsSchemas,
  portionOf,
  roundFoodGroupServes,
  roundNutrientVector,
  sumPortions,
  type MealCard,
  type SavedMealItem,
} from '@diet-tracker/shared'
import { v7 as uuidv7 } from 'uuid'
import { AppError } from '../../../errors.js'
import { getFood, toWireFood } from '../../../log/foods-service.js'
import { fmt, whole } from '../format.js'
import { defineTool, empty, type DraftResult } from './types.js'

/**
 * A saved meal from My foods, as the meal editor would build it: each ingredient's numbers
 * are a snapshot of the library food scaled to the amount. Save goes through `POST /meals`.
 */
export const draftMeal = defineTool({
  name: 'draft_meal',
  description:
    'Draft a saved meal from the person’s own foods (ids from search_my_foods) as a card they save with a tap: a name and the ingredients with amounts in grams or servings. Saved meals log in a few taps with no estimate. Nothing is saved by this call. Use when they ask to save, create or remember a meal; search their foods first and only use ids you were given.',
  schema: coachToolArgsSchemas.draft_meal,
  status: (args) => `Putting together "${args.name}"`,
  async run(ctx, args): Promise<DraftResult | ReturnType<typeof empty>> {
    const items: SavedMealItem[] = []
    const missing: string[] = []
    for (const input of args.items) {
      let row
      try {
        row = await getFood(ctx.userId, input.food_id)
      } catch (error) {
        if (error instanceof AppError && error.code === 'not_found') {
          missing.push(input.food_id)
          continue
        }
        throw error
      }
      const food = toWireFood(row)
      const perServing = food.basis === 'per_serving'
      if (input.unit === 'serving' && (!perServing || !food.servingGrams)) {
        missing.push(`${food.name} (no serving size; give grams)`)
        continue
      }
      const grams = input.unit === 'serving' ? input.amount * (food.servingGrams ?? 0) : input.amount
      const portion = portionOf(food, grams)
      items.push({
        name: food.name,
        quantity: input.amount,
        unit:
          input.unit === 'serving' ? (food.servingLabel ?? 'serving').slice(0, 30) : 'g',
        grams,
        nutrients: roundNutrientVector(portion.nutrients),
        foodGroups: roundFoodGroupServes(portion.foodGroups),
        foodId: food.id,
      })
    }
    if (items.length === 0) {
      return empty(
        `none of the foods could be used (${missing.join('; ')}); use ids from search_my_foods`,
      )
    }
    const totals = sumPortions(items).totals
    const card: MealCard = {
      id: uuidv7(),
      kind: 'meal',
      state: 'drafted',
      name: args.name.trim(),
      items,
      totals: {
        energy_kcal: whole(totals.energy_kcal),
        protein_g: whole(totals.protein_g),
        carbs_g: whole(totals.carbs_g),
        fat_g: whole(totals.fat_g),
      },
      meal: args.meal,
    }
    return {
      card,
      summary: {
        card: 'meal',
        shows: 'a meal card the person saves with "Save to meals"; nothing is saved until they tap it',
        name: card.name,
        ...(args.meal ? { usually_at: MEAL_LABELS[args.meal] } : {}),
        items: items.map((item) => ({
          name: item.name,
          amount: `${fmt(item.quantity)} ${item.unit}`,
          grams: whole(item.grams),
          kcal: whole(item.nutrients.energy_kcal),
          protein_g: whole(item.nutrients.protein_g),
        })),
        totals: `${card.totals.energy_kcal} kcal, ${card.totals.protein_g} g protein, ${card.totals.carbs_g} g carbs, ${card.totals.fat_g} g fat`,
        ...(missing.length ? { left_out: missing } : {}),
      },
    }
  },
})
