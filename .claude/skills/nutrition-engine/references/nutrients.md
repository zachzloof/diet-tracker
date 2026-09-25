# Nutrient keys, units, DRIs, food groups, scoring, gap rules

## 1. NutrientKey enum (canonical units)

The enum lives in `packages/shared/src/nutrition/nutrients.ts`. Every JSONB nutrient vector, AI schema, and target uses exactly these keys and units.

| key | unit | kind | display group |
|---|---|---|---|
| energy_kcal | kcal | goal | energy |
| protein_g | g | goal | macros |
| carbs_g | g | goal | macros |
| fat_g | g | goal | macros |
| fiber_g | g | minimum | macros |
| sugar_g | g | info | macros |
| added_sugar_g | g | limit | macros |
| saturated_fat_g | g | limit | macros |
| sodium_mg | mg | limit | minerals |
| potassium_mg | mg | minimum | minerals |
| calcium_mg | mg | minimum | minerals |
| iron_mg | mg | minimum | minerals |
| magnesium_mg | mg | minimum | minerals |
| zinc_mg | mg | minimum | minerals |
| vitamin_a_ug | mcg RAE | minimum | vitamins |
| vitamin_c_mg | mg | minimum | vitamins |
| vitamin_d_ug | mcg | minimum | vitamins |
| vitamin_b12_ug | mcg | minimum | vitamins |
| folate_ug | mcg DFE | minimum | vitamins |
| water_ml | ml | goal | hydration |
| alcohol_std_drinks | drinks (10 g ethanol) | limit | other |

Vectors are complete: every key present, numbers >= 0, no nulls. Unknown means 0 with low confidence on the item, never a missing key. This keeps aggregation trivial and the AI schema strict.

## 2. Dietary reference intakes (adults)

Source: US NIH Office of Dietary Supplements DRI tables (RDA, or AI where no RDA exists). Sex `unspecified` uses the higher of the two so nobody is under-targeted.

| nutrient | male 19-30 | male 31-50 | male 51-70 | male 71+ | female 19-30 | female 31-50 | female 51-70 | female 71+ |
|---|---|---|---|---|---|---|---|---|
| potassium_mg (AI) | 3400 | 3400 | 3400 | 3400 | 2600 | 2600 | 2600 | 2600 |
| calcium_mg | 1000 | 1000 | 1000 | 1200 | 1000 | 1000 | 1200 | 1200 |
| iron_mg | 8 | 8 | 8 | 8 | 18 | 18 | 8 | 8 |
| magnesium_mg | 400 | 420 | 420 | 420 | 310 | 320 | 320 | 320 |
| zinc_mg | 11 | 11 | 11 | 11 | 8 | 8 | 8 | 8 |
| vitamin_a_ug | 900 | 900 | 900 | 900 | 700 | 700 | 700 | 700 |
| vitamin_c_mg | 90 | 90 | 90 | 90 | 75 | 75 | 75 | 75 |
| vitamin_d_ug | 15 | 15 | 15 | 20 | 15 | 15 | 15 | 20 |
| vitamin_b12_ug | 2.4 | 2.4 | 2.4 | 2.4 | 2.4 | 2.4 | 2.4 | 2.4 |
| folate_ug | 400 | 400 | 400 | 400 | 400 | 400 | 400 | 400 |
| sodium_mg (limit) | 2300 | 2300 | 2300 | 2300 | 2300 | 2300 | 2300 | 2300 |

Notes for reasons and UI copy: vegans get B12 from fortified foods or supplements, so the gap suggestion list must say so rather than list meat. Upper limits are not enforced from food; they would only matter for supplements.

## 3. Food-group serves

Serve sizes follow the Australian Dietary Guidelines (close to MyPlate); the AI prompt quotes these definitions verbatim so estimates are consistent.

| key | 1 serve is | daily target | kind |
|---|---|---|---|
| vegetables | 75 g cooked vegetables or legumes, or 1 cup salad, or half a medium potato | 5 (female), 6 (male) | minimum |
| fruit | 150 g fresh fruit, or 1 medium piece, or 30 g dried | 2 | minimum |
| whole_grains | 1 slice wholegrain bread, half a cup cooked wholegrain rice, pasta or oats, 30 g wholegrain cereal | 4 (female), 6 (male); 3 for `low_carb` | minimum |
| protein_foods | 65 g cooked lean meat, 80 g cooked poultry, 100 g cooked fish, 2 large eggs, 150 g cooked legumes or tofu, 30 g nuts or seeds | 2.5 (female), 3 (male) | minimum |
| dairy_or_alt | 250 ml milk or fortified plant milk, 200 g yoghurt, 40 g hard cheese | 2.5; 3.5 for female 51+, 4 for female 71+ | minimum |
| legumes | 150 g cooked legumes (counts toward protein_foods and vegetables too) | info; suggested for vegetarian and vegan patterns | info |
| nuts_seeds | 30 g | info | info |

Food-group vectors are complete like nutrient vectors: all seven keys, numbers >= 0 (fractional serves allowed).

## 4. Day scoring (`evaluateDay`)

Per-target status from `actual / target`:

| kind | met | close | short / over |
|---|---|---|---|
| goal (energy) | 0.90 to 1.10 | 0.80 to 1.20 | below 0.80 short, above 1.20 over |
| goal (protein) | >= 0.90 | 0.75 to 0.90 | below 0.75 short; never "over" |
| goal (carbs, fat) | 0.80 to 1.20 | 0.65 to 1.35 | outside: short or over |
| goal (water) | >= 0.90 | 0.70 to 0.90 | below 0.70 short |
| minimum | >= 1.00 | 0.75 to 1.00 | below 0.75 short |
| limit | <= 1.00 | 1.00 to 1.15 | above 1.15 over |
| info | not scored | | |

Overall:
- `dayMet` = energy is `met` or `close`, and protein is `met`, and no `limit` is `over`. This is the number behind "days met this week". It is deliberately achievable: energy in band, protein hit, nothing blown.
- `completeness` = share of `minimum` targets (fibre, micronutrients, food groups) that are `met` or `close`. Shown as a secondary score and used by gap detection; it never flips `dayMet`.
- A day with fewer than 2 log entries and under 40% of the energy target is `unlogged`, not `short`, so forgotten days do not pollute stats. Unlogged days are excluded from averages and gap rules but break streaks.

## 5. Gap rules (`findGaps`)

Evaluated over the last 7 calendar days, using only logged days; require at least 4 logged days, otherwise return a single "log a few more days" gap. Each rule yields a `Gap { key, severity, evidence, suggestions[] }`.

| rule | triggers when | severity |
|---|---|---|
| energy_off_plan | average energy ratio outside 0.85 to 1.15 (note the direction) | high |
| protein_short | protein `short` or `close` on 3+ logged days | high |
| limit_over (sodium, saturated_fat, added_sugar, alcohol) | `over` on 3+ logged days | medium |
| fibre_short | fibre below 0.75 on 4+ logged days | medium |
| food_group_short (vegetables, fruit, whole_grains, dairy_or_alt, protein_foods) | ratio below 0.60 on 4+ logged days | medium |
| micro_short (each `minimum` micronutrient) | below 0.70 on 5+ logged days | low |
| water_short | below 0.70 on 4+ logged days | low |
| logging_gaps | 3+ unlogged days | low |

Ranking: severity, then how far off (average ratio), then alphabetical for stability. Show the top five in the UI.

Suggestions are a static map from gap key to foods, filtered by `dietPattern`, `allergies` and `dislikes`, then optionally rephrased by the AI in the weekly review. Example seeds: fibre: oats, lentils, chia, raspberries, wholegrain bread. Iron: lean red meat, lentils, tofu, spinach with a vitamin C source. Calcium: milk, yoghurt, fortified soy milk, tinned sardines, tahini. Vegetables: frozen mixed veg, a big salad at lunch, veg in the pasta sauce. Vegan B12: fortified nutritional yeast, fortified plant milk, a supplement.
