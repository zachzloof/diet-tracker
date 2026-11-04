import { MEAL_LABELS, coachToolArgsSchemas, type EstimateCard } from '@diet-tracker/shared'
import { v7 as uuidv7 } from 'uuid'
import { estimateFood } from '../../estimate.js'
import { relativeDayLabel, whole } from '../format.js'
import { defineTool, empty, type DraftResult } from './types.js'

const STATUS_CHARS = 40

/**
 * Runs the estimator on the person's words (same daily cap and foods memory as the quick-add
 * sheet) and returns the estimate as a card. Nothing is logged: the person reviews the items,
 * picks the meal and day, and confirms through `POST /log/entries` as the sheet does.
 */
export const draftFoodLog = defineTool({
  name: 'draft_food_log',
  description:
    'Draft a food log entry from what the person says they ate ("2 eggs and toast"). Runs the app’s estimator and returns an estimate card with the items, grams, kcal and macros; the person reviews and confirms it with a tap. Nothing is logged by this call. Use when they ask to log, add or record food; pass the meal and day only when they said them.',
  schema: coachToolArgsSchemas.draft_food_log,
  status: (args) =>
    `Estimating "${args.text.length > STATUS_CHARS ? `${args.text.slice(0, STATUS_CHARS - 1).trimEnd()}…` : args.text}"`,
  async run(ctx, args): Promise<DraftResult | ReturnType<typeof empty>> {
    if (args.day && args.day > ctx.today) {
      return empty(
        `${args.day} has not happened yet. Draft it with day null; the person can pick Tomorrow on the card, which only takes plans`,
      )
    }
    const response = await estimateFood({
      userId: ctx.userId,
      profile: ctx.profile,
      text: args.text,
      at: ctx.now,
    })
    const result = {
      ...response,
      day: args.day ?? response.day,
      meal: args.meal ?? response.meal,
    }
    const card: EstimateCard = {
      id: uuidv7(),
      kind: 'estimate',
      state: 'drafted',
      text: args.text,
      result,
    }
    const items = result.estimate.items
    return {
      card,
      summary: {
        card: 'estimate',
        shows: `an estimate card the person confirms with "Add to ${MEAL_LABELS[result.meal].toLowerCase()}"; nothing is logged until they tap it`,
        day: `${result.day} (${relativeDayLabel(result.day, ctx.today)})`,
        meal: MEAL_LABELS[result.meal],
        items: items.map((item) => ({
          name: item.name,
          quantity: `${item.quantity} ${item.unit}`,
          grams: whole(item.grams),
          kcal: whole(item.nutrients.energy_kcal),
          protein_g: whole(item.nutrients.protein_g),
          carbs_g: whole(item.nutrients.carbs_g),
          fat_g: whole(item.nutrients.fat_g),
          confidence: item.confidence,
          ...(item.assumptions.length ? { assumptions: item.assumptions } : {}),
        })),
        total_kcal: whole(items.reduce((sum, item) => sum + item.nutrients.energy_kcal, 0)),
        total_protein_g: whole(items.reduce((sum, item) => sum + item.nutrients.protein_g, 0)),
        ...(result.estimate.clarifying_question
          ? { clarifying_question: result.estimate.clarifying_question }
          : {}),
        estimates_left_today: result.callsRemaining,
      },
    }
  },
})
