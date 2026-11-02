import { coachToolArgsSchemas, portionOf, referenceGrams } from '@diet-tracker/shared'
import { listFoods } from '../../../log/foods-service.js'
import { fmt, whole } from '../format.js'
import { defineTool, empty } from './types.js'

const LIMIT = 20

/** The person's own food library, as My foods searches it. */
export const searchMyFoods = defineTool({
  name: 'search_my_foods',
  description:
    'Search the person’s saved foods (My foods) by name or brand: up to 20 verified foods with their serving and the kcal, protein, carbs and fat per serving. Use when suggesting what to eat from what they already log.',
  schema: coachToolArgsSchemas.search_my_foods,
  status: (args) => `Searching My foods for "${args.query}"`,
  async run(ctx, args) {
    const foods = (await listFoods(ctx.userId, { q: args.query, limit: 100 }))
      .filter((f) => f.verified)
      .slice(0, LIMIT)
    if (foods.length === 0) {
      return empty(args.query ? `no saved food matches "${args.query}"` : 'no saved foods yet')
    }
    return {
      query: args.query,
      foods: foods.map((food) => {
        const grams = referenceGrams(food)
        const portion = portionOf(food, grams)
        return {
          id: food.id,
          name: food.brand ? `${food.name} (${food.brand})` : food.name,
          per:
            food.basis === 'per_serving'
              ? (food.servingLabel ?? `${fmt(grams)} g serving`)
              : '100 g',
          kcal: whole(portion.nutrients.energy_kcal),
          protein_g: whole(portion.nutrients.protein_g),
          carbs_g: whole(portion.nutrients.carbs_g),
          fat_g: whole(portion.nutrients.fat_g),
          last_used: food.lastUsedAt?.slice(0, 10) ?? null,
        }
      }),
    }
  },
})
