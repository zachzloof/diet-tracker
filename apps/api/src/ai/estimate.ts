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
import { callStructured, type StructuredCall } from './openai.js'

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

/** ISO country for the web search tool's location hint, or null when the zone is ambiguous. */
export function countryFromTimeZone(timeZone: string): string | null {
  const [area = '', city = ''] = timeZone.split('/')
  if (timeZone === 'Europe/London') return 'GB'
  if (timeZone === 'Europe/Dublin') return 'IE'
  if (area === 'Australia') return 'AU'
  if (area === 'Pacific' && city === 'Auckland') return 'NZ'
  if (
    area === 'America' &&
    ['Toronto', 'Vancouver', 'Edmonton', 'Winnipeg', 'Halifax'].includes(city)
  ) {
    return 'CA'
  }
  if (
    area === 'America' &&
    ['New_York', 'Chicago', 'Denver', 'Los_Angeles', 'Phoenix', 'Anchorage', 'Detroit'].includes(
      city,
    )
  ) {
    return 'US'
  }
  return null
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

export interface EstimatePromptOptions {
  /** Whether the web search tool is offered on this call; the rules differ. */
  webSearch: boolean
}

function brandedProductRules(region: string, webSearch: boolean): string[] {
  if (!webSearch) {
    return [
      `- When the text names a brand, retailer, restaurant chain or specific product ("M&S fries", "Asda mozzarella sticks", "Greggs sausage roll"), use that product's published nutrition label from memory if you know it for ${region}; set brand to the brand or retailer and source_url to null. If you do not know the product, estimate from the closest generic equivalent, say so in assumptions and lower the confidence.`,
    ]
  }
  return [
    `- When the text names a brand, retailer, restaurant chain or specific product ("M&S fries", "Asda mozzarella sticks", "Greggs sausage roll", "Huel Black"), SEARCH THE WEB for that exact product's nutrition information before answering. Prefer the retailer's or manufacturer's own product page for ${region}; a grocery-delivery listing or a nutrition database is acceptable when the official page is not found. Read the per-100 g or per-serving values from the label and scale them to the quantity eaten. Set brand to the brand or retailer, set source_url to the page you took the values from, set confidence to high (medium when the quantity had to be assumed), and add an assumption naming the pack size or serving the label uses (for example "Asda pack is 250 g, 5 sticks; assumed 5 sticks").`,
    '- Search at most twice per product. If the product cannot be found, estimate from the closest generic equivalent, set source_url to null, say in assumptions that the product page was not found, and lower the confidence to medium or low. Never invent a URL.',
    '- Do not search for generic foods (eggs, toast, chicken, rice, an apple); estimate those from typical values with brand and source_url null.',
  ]
}

export function buildEstimateSystemPrompt(
  profile: Profile,
  library: LibraryMatch[],
  options: EstimatePromptOptions = { webSearch: false },
): string {
  const allergies = profile.allergies.length ? profile.allergies.join(', ') : 'none'
  const region = regionFromTimeZone(profile.timezone)
  const lines = [
    "You are a nutrition estimator for a food diary. Convert the user's description of what they ate into structured items with realistic nutrient totals.",
    '',
    'Rules:',
    '- One item per distinct food, at most 15. Amounts are for the TOTAL quantity described, not per 100 g.',
    '- Use typical values for cooked, as-eaten food (USDA-like). Include cooking fats and sauces when implied by the preparation.',
    ...brandedProductRules(region, options.webSearch),
    `- If a quantity is missing, assume one typical serving for ${region} and state it in assumptions, for example "assumed 2 slices of toast". Silent guesses are the one thing the user cannot correct.`,
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

/** Only an absolute http(s) URL is worth linking; anything else becomes null. */
export function tidyUrl(value: string | null): string | null {
  const trimmed = value?.trim() ?? ''
  if (trimmed.length === 0 || trimmed.length > 2000) return null
  try {
    const url = new URL(trimmed)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
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
      brand: item.brand?.trim().slice(0, 80) || null,
      source_url: tidyUrl(item.source_url),
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

/** A search reads one or two product pages; the 30 s default is too tight for that. */
export const ESTIMATE_WITH_SEARCH_TIMEOUT_MS = 75_000

/** The web search tool (D16) and the longer timeout it needs, when `AI_WEB_SEARCH` is on. */
export function estimateCallOptions(
  timeZone: string,
): Pick<StructuredCall<FoodEstimate>, 'webSearch' | 'timeoutMs'> {
  if (!env.AI_WEB_SEARCH) return {}
  return {
    webSearch: { country: countryFromTimeZone(timeZone), timezone: timeZone },
    timeoutMs: ESTIMATE_WITH_SEARCH_TIMEOUT_MS,
  }
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
    system: buildEstimateSystemPrompt(profile, library, { webSearch: env.AI_WEB_SEARCH }),
    user: buildEstimateUserMessage(text, at, profile.timezone),
    maxOutputTokens: 6000,
    ...estimateCallOptions(profile.timezone),
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
