import {
  DIET_PATTERN_LABELS,
  FOOD_GROUPS,
  FOOD_GROUP_KEYS,
  foodEstimateSchema,
  inferMeal,
  localTimeParts,
  sanitiseFoodGroupServes,
  sanitiseNutrientVector,
  startOfLocalDay,
  suggestDayAndMeal,
  type EstimateResponse,
  type Food,
  type FoodEstimate,
  type FoodItem,
  type Profile,
} from '@diet-tracker/shared'
import { and, count, eq, gte } from 'drizzle-orm'
import { db } from '../db/client.js'
import { aiCalls } from '../db/schema/index.js'
import { env } from '../env.js'
import { errors } from '../errors.js'
import { findLibraryMatches } from '../log/foods-service.js'
import { callStructured } from './openai.js'

/**
 * Purpose `estimate`: "4 eggs and two slices of toast" in, structured items with realistic
 * totals out. The prompt quotes the units and serve definitions verbatim so estimates stay
 * consistent, and the person's own verified foods are offered for reuse (D5 option C).
 */

export const MAX_ESTIMATE_ITEMS = 15
const MAX_LIBRARY_MATCHES = 20

const UNITS_RULE =
  'Units: energy kcal; protein, carbs, fat, fibre, sugars, added sugar, saturated fat in g; sodium, potassium, calcium, iron, magnesium, zinc, vitamin C in mg; vitamin A (RAE), vitamin D, B12 and folate (DFE) in mcg; water in ml; alcohol in standard drinks of 10 g ethanol.'

function serveDefinitions(): string {
  return FOOD_GROUP_KEYS.map(
    (key) => `  - ${key}: 1 serve is ${FOOD_GROUPS[key].serveDefinition}`,
  ).join('\n')
}

/** Country hint from the IANA zone: portion sizes differ by region. */
export function regionFromTimeZone(timeZone: string): string {
  const [area = '', city = ''] = timeZone.split('/')
  if (timeZone === 'Europe/London') return 'the United Kingdom'
  if (area === 'Australia') return 'Australia'
  if (area === 'Europe') return `Europe (${city.replace(/_/g, ' ')})`
  if (area === 'America') return `the Americas (${city.replace(/_/g, ' ')})`
  if (area === 'Asia') return `Asia (${city.replace(/_/g, ' ')})`
  if (area === 'Pacific' && city === 'Auckland') return 'New Zealand'
  if (area === 'Africa') return `Africa (${city.replace(/_/g, ' ')})`
  return 'an English-speaking country'
}

export interface LibraryMatch {
  id: string
  name: string
  brand: string | null
  basis: Food['basis']
  servingGrams: number | null
  servingLabel: string | null
  nutrients: Food['nutrients']
  foodGroups: Food['foodGroups']
}

export function buildEstimateSystemPrompt(profile: Profile, library: LibraryMatch[]): string {
  const allergies = profile.allergies.length ? profile.allergies.join(', ') : 'none'
  const lines = [
    "You are a nutrition estimator for a food diary. Convert the user's description of what they ate into structured items with realistic nutrient totals.",
    '',
    'Rules:',
    '- One item per distinct food, at most 15. Amounts are for the TOTAL quantity described, not per 100 g.',
    '- Use typical values for cooked, as-eaten food (USDA-like). Include cooking fats and sauces when implied by the preparation.',
    `- If a quantity is missing, assume one typical serving for ${regionFromTimeZone(profile.timezone)} and state it in assumptions, for example "assumed 2 slices of toast". Silent guesses are the one thing the user cannot correct.`,
    '- Set clarifying_question only when the answer would change energy by more than about 30% (a slice of pizza versus a whole pizza; a protein shake with no brand or size). Otherwise leave it null, estimate, and state the assumption.',
    `- ${UNITS_RULE} Never leave a value null or negative; use 0 and lower the item confidence if genuinely unknown.`,
    '- Food-group serves use these definitions exactly:',
    serveDefinitions(),
    '- confidence per item: high for packaged foods with stated weights or precise counts of common foods; medium for home-cooked food with quantities; low for restaurant meals, "some" or "a bit of".',
    '- meal_hint: breakfast, lunch, dinner or snack from the food and the local time given, or null if unclear.',
    "- input_text is the fragment of the user's text the item came from, copied verbatim.",
    `- The user's diet pattern is ${DIET_PATTERN_LABELS[profile.dietPattern].label}; allergies or intolerances: ${allergies}. Interpret ambiguous foods accordingly (a vegan's "milk" is plant milk).`,
  ]
  if (library.length > 0) {
    lines.push(
      "- The user's own foods, with values they have verified, are listed below as JSON. When an item clearly matches one, reuse its values scaled to the quantity eaten and set matched_food_id to its id. Otherwise set matched_food_id to null.",
      JSON.stringify(
        library.map((food) => ({
          id: food.id,
          name: food.name,
          brand: food.brand,
          basis: food.basis,
          serving_grams: food.servingGrams,
          serving_label: food.servingLabel,
          nutrients: food.nutrients,
          food_groups: food.foodGroups,
        })),
      ),
    )
  } else {
    lines.push('- The user has no saved foods yet; set matched_food_id to null on every item.')
  }
  return lines.join('\n')
}

export function buildEstimateUserMessage(text: string, at: Date, timeZone: string): string {
  const { hour, minute } = localTimeParts(at, timeZone)
  const clock = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  return `Local time: ${clock}.\n\nWhat I ate: ${text}`
}

/** Trims text, clamps vectors, drops empty items and caps the count. Never throws on odd but valid data. */
export function tidyEstimate(estimate: FoodEstimate): FoodEstimate {
  const items: FoodItem[] = estimate.items
    .filter((item) => item.name.trim().length > 0 && Number.isFinite(item.grams))
    .slice(0, MAX_ESTIMATE_ITEMS)
    .map((item) => ({
      ...item,
      name: item.name.trim().slice(0, 120),
      input_text: item.input_text.trim().slice(0, 200),
      unit: item.unit.trim().slice(0, 30) || 'serving',
      quantity: item.quantity > 0 && Number.isFinite(item.quantity) ? item.quantity : 1,
      grams: Math.max(0, item.grams),
      preparation: item.preparation?.trim() || null,
      assumptions: item.assumptions
        .map((a) => a.trim())
        .filter((a) => a.length > 0)
        .slice(0, 5),
      matched_food_id: item.matched_food_id?.trim() || null,
      nutrients: sanitiseNutrientVector(item.nutrients),
      food_groups: sanitiseFoodGroupServes(item.food_groups),
    }))
  return {
    items,
    meal_hint: estimate.meal_hint,
    overall_confidence: estimate.overall_confidence,
    clarifying_question: estimate.clarifying_question?.trim() || null,
  }
}

/** Calls this user has made since local midnight, any purpose, any outcome. */
export async function callsToday(userId: string, timeZone: string, now: Date): Promise<number> {
  const { day } = suggestDayAndMeal(now, timeZone)
  const since = startOfLocalDay(day, timeZone)
  const rows = await db
    .select({ n: count() })
    .from(aiCalls)
    .where(and(eq(aiCalls.userId, userId), gte(aiCalls.createdAt, since)))
  return rows[0]?.n ?? 0
}

export interface EstimateArgs {
  userId: string
  profile: Profile
  text: string
  at: Date
}

/**
 * The quick-add flow (ai-food-estimation skill): cap, library memory, call, tidy. Nothing
 * is written to `log_entries` here; the person reviews and confirms first.
 */
export async function estimateFood(args: EstimateArgs): Promise<EstimateResponse> {
  const { userId, profile, text, at } = args
  const used = await callsToday(userId, profile.timezone, at)
  if (used >= env.AI_DAILY_CALL_CAP) throw errors.aiCapReached(env.AI_DAILY_CALL_CAP, used)

  const library = await findLibraryMatches(userId, text, MAX_LIBRARY_MATCHES)
  const result = await callStructured({
    purpose: 'estimate',
    userId,
    schemaName: 'food_estimate',
    schema: foodEstimateSchema,
    system: buildEstimateSystemPrompt(profile, library),
    user: buildEstimateUserMessage(text, at, profile.timezone),
    maxOutputTokens: 6000,
  })
  const estimate = tidyEstimate(result.data)
  if (estimate.items.length === 0 && !estimate.clarifying_question) throw errors.aiUnclear()

  const suggestion = suggestDayAndMeal(at, profile.timezone)
  const knownIds = new Set(library.map((food) => food.id))
  return {
    estimate: {
      ...estimate,
      // Only ids we actually offered count as matches; the model must not invent one.
      items: estimate.items.map((item) => ({
        ...item,
        matched_food_id:
          item.matched_food_id && knownIds.has(item.matched_food_id) ? item.matched_food_id : null,
      })),
    },
    aiCallId: result.callId,
    day: suggestion.day,
    previousDay: suggestion.previousDay,
    meal: estimate.meal_hint ?? inferMeal(suggestion.localHour),
    callsRemaining: Math.max(0, env.AI_DAILY_CALL_CAP - used - 1),
  }
}
