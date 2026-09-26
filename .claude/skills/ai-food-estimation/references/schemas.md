# AI schemas and prompt skeletons

Zod definitions live in `packages/shared/src/ai/schemas.ts`. Shown here as shapes; keep the code and this file in step. Strict Structured Outputs: every field required, no additional properties, optionality expressed as `| null`.

## FoodEstimate (purpose `estimate`)

```
FoodEstimate {
  items: FoodItem[]                       // one per distinct food, 1 to 15
  meal_hint: 'breakfast' | 'lunch' | 'dinner' | 'snack' | null
  overall_confidence: 'high' | 'medium' | 'low'
  clarifying_question: string | null      // only when ambiguity materially changes the numbers
}

FoodItem {
  name: string                            // canonical, e.g. "Egg, whole, large, boiled"
  input_text: string                      // the fragment of the user's text this came from
  quantity: number                        // in `unit`
  unit: string                            // "egg", "slice", "cup", "g", "ml", "serving"
  grams: number                           // total edible weight estimate
  preparation: string | null              // "fried in 1 tsp butter"
  assumptions: string[]                   // "assumed large eggs (50 g each)"
  confidence: 'high' | 'medium' | 'low'
  matched_food_id: string | null          // id of a user library food reused for consistency
  brand: string | null                    // brand, retailer or chain the person named ("Asda", "M&S")
  source_url: string | null               // product page the label was read from (web search, D16)
  nutrients: NutrientVector               // for the TOTAL quantity, all keys, >= 0
  food_groups: FoodGroupServes            // for the TOTAL quantity, all keys, >= 0
}

NutrientVector = { energy_kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, added_sugar_g,
  saturated_fat_g, sodium_mg, potassium_mg, calcium_mg, iron_mg, magnesium_mg, zinc_mg,
  vitamin_a_ug, vitamin_c_mg, vitamin_d_ug, vitamin_b12_ug, folate_ug, water_ml,
  alcohol_std_drinks }                    // all number >= 0

FoodGroupServes = { vegetables, fruit, whole_grains, protein_foods, dairy_or_alt, legumes,
  nuts_seeds }                            // all number >= 0
```

### System prompt skeleton (estimate)
```
You are a nutrition estimator for a food diary. Convert the user's description of what they ate
into structured items with realistic nutrient totals.

Rules:
- Amounts are for the total quantity described, not per 100 g.
- Use typical values for cooked, as-eaten food (USDA-like). Include cooking fats if implied.
- If a quantity is missing, assume one typical serving for {region} and state it in assumptions.
- Ask a clarifying_question only if the answer would change energy by more than about 30%.
  Otherwise estimate and state the assumption.
- Units: energy kcal; protein, carbs, fat, fibre, sugars, saturated fat in g; sodium, potassium,
  calcium, iron, magnesium, zinc, vitamin C in mg; vitamin A (RAE), vitamin D, B12, folate (DFE)
  in mcg; water ml; alcohol in standard drinks of 10 g ethanol. Never leave a value null; use 0
  and lower confidence if genuinely unknown.
- Food-group serves use these definitions exactly: {serve definitions from nutrients.md}.
- The user's diet pattern is {dietPattern}; allergies: {allergies}. Interpret ambiguous foods
  accordingly (a vegan's "milk" is plant milk).
- The user's own foods, with values they have verified, are listed below. When an item clearly
  matches one, reuse its values scaled to the quantity and set matched_food_id.
{library matches as JSON}
- When the text names a brand, retailer, chain or product, SEARCH THE WEB for that exact
  product's nutrition information; prefer the retailer's or manufacturer's page for {region};
  scale the label to the quantity eaten; set brand, source_url and confidence high; name the
  pack size in assumptions. Not found: generic estimate, source_url null, lower confidence.
  Never search for generic foods. (Only when the web_search tool is offered.)
```

User message: the raw text, plus local time of day (for `meal_hint`).

## PlanExplanation (purpose `explain_plan`, slice 2)

```
PlanExplanation {
  headline: string                        // one sentence, e.g. "A lean gain built around 150 g protein"
  paragraphs: string[]                    // 2 to 4 short paragraphs, plain English, uses the actual numbers
  key_habits: string[]                    // 3 concrete habits for this person
  caveats: string[]                       // 0 to 3, e.g. "Rest-day water target is lower"
}
```
Input: the profile summary and the full `Targets` including every `reason`. Instruction: explain, do not change; mention numbers exactly as given; respect diet pattern and allergies in habit suggestions; never give medical advice; keep under 200 words total.

## WeeklyReview (purpose `weekly_review`, slice 4)

```
WeeklyReview {
  summary: string                         // 2 sentences on the week
  wins: string[]                          // 1 to 3
  changes: { title: string, why: string, how: string }[]   // exactly 2, ranked
  encouragement: string                   // 1 sentence, specific, not saccharine
}
```
Input: the seven `DayScore`s, the ranked `Gap[]` with their evidence, the targets, and the profile. Instruction: base every claim on the supplied numbers; take the top two gaps as the two changes unless a `high` severity gap makes one obvious; suggestions must respect diet pattern, allergies and dislikes.

## Recorded fixtures
`apps/api/src/ai/__fixtures__/<slug>.json` holds `{ input, response }` for each canonical input. Re-record with `pnpm ai:smoke --record` when the schema changes, and diff the values by eye before committing.
