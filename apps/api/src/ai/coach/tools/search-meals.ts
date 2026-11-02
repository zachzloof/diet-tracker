import { coachToolArgsSchemas, sumPortions } from '@diet-tracker/shared'
import { listSavedMeals } from '../../../log/saved-meals-service.js'
import { whole } from '../format.js'
import { defineTool, empty } from './types.js'

const LIMIT = 20

/** The person's saved meals, most recently logged first. */
export const searchMeals = defineTool({
  name: 'search_meals',
  description:
    'The person’s saved meals (named sets of ingredients they log in one go), filtered by part of the name or all of them with an empty query: up to 20, each with its ingredients and the kcal and protein of one portion.',
  schema: coachToolArgsSchemas.search_meals,
  status: (args) =>
    args.query ? `Searching your meals for "${args.query}"` : 'Looking at your meals',
  async run(ctx, args) {
    const needle = args.query.trim().toLowerCase()
    const meals = (await listSavedMeals(ctx.userId))
      .filter((meal) => !needle || meal.name.toLowerCase().includes(needle))
      .slice(0, LIMIT)
    if (meals.length === 0) {
      return empty(needle ? `no saved meal matches "${args.query}"` : 'no saved meals yet')
    }
    return {
      meals: meals.map((meal) => {
        const totals = sumPortions(meal.items)
        return {
          id: meal.id,
          name: meal.name,
          items: meal.items.map((item) => `${item.quantity} ${item.unit} ${item.name}`),
          kcal: whole(totals.totals.energy_kcal),
          protein_g: whole(totals.totals.protein_g),
          carbs_g: whole(totals.totals.carbs_g),
          fat_g: whole(totals.totals.fat_g),
          last_logged: meal.lastUsedAt?.slice(0, 10) ?? null,
        }
      }),
    }
  },
})
