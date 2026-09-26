# Changelog

All user-visible changes, grouped by slice. Newest first.

## Unreleased

### Fixes after slice 3 (2026-09-26)
- Named products are looked up online. Type a brand, shop or product ("asda mozzarella sticks", "m&s fries, 150g") and the estimator searches the web with OpenAI's built-in tool, reads the retailer's label and scales it to what you ate. The item shows a "Label found online" chip, the brand, and a link to the page the numbers came from; the assumptions name the pack size it used. Generic foods ("4 eggs") are never searched. In the smoke run the Asda sticks came from asda.com (341 kcal for 5 sticks, 100 g) and the M&S fries from marksandspencer.com (260 kcal for 150 g). `AI_WEB_SEARCH=false` turns it off; `ai_calls.web_search_calls` counts searches for the bill.
- Estimates are fully editable. Tap an item to change its quantity or its weight in grams (every number rescales, so 4 eggs at 200 g become 3 eggs at 150 g) or to correct any single nutrient: energy, protein, carbs and fat up front, the other seventeen behind "More nutrients". Correcting a nutrient changes only that number and marks the item "Edited"; a later portion change scales the corrected values. The same editor is in the entry sheet on Today, so a logged item can be fixed after the fact.
- Saved AI items keep their brand in My foods, so "asda" matches next time and the estimator reuses your verified numbers instead of searching again.
- Under the hood: `brand` and `source_url` on every estimate item, `rescaleToGrams` in the shared portion math, `web_search_calls` on `ai_calls` (migration 0003), a 75 s call timeout when search is offered, `pnpm ai:smoke` now runs seven inputs and prints searches and sources.

### Slice 3 - Food logging: AI quick-add, manual entry, food library (2026-09-26)
- Quick add: tap the big + and type what you ate ("4 eggs and two slices of toast with butter"). The AI returns each item with grams, energy, protein, carbs and fat, how confident it is, and the assumptions it made. Tap an item to change the quantity (the numbers rescale), remove it, or save it to My foods. Confident items are saved by default so the next time costs no guesswork. If the AI needs one detail that changes the numbers a lot it asks; you can answer or keep the estimate.
- Meal and day: the meal is guessed from the time and is one tap to change. Before 04:00 the app offers yesterday, so a late dinner lands on the day it belongs to. Any day can be chosen.
- My foods: your library of foods entered by hand or saved from estimates. Search it and log a food with a portion in servings or grams, with the numbers shown before you confirm. No AI call is made. Edit or delete foods from You > My foods; deleting a food leaves past entries as they were.
- Manual entry: a label-style form, per 100 g or per serving, with the nine numbers from a packet up front and the rest behind "More nutrients" and "Food-group serves". Log an amount now and save the food for later.
- Today: energy remaining as the hero number with eaten versus target, bars for protein, carbs, fat and fibre, and the day's entries grouped by meal with a kcal subtotal each. Step back to earlier days. Tap an entry to change the amount, move it to another meal or day, or delete it.
- Guards: 500-character input cap, a per-user daily cap on AI estimates with a clear message when it is reached, a 30 s timeout with one retry, and a friendly failure that drops you into manual entry with your text carried over. Every call is logged with model, tokens and latency.
- API: `POST /api/v1/ai/estimate`, `GET /api/v1/log/day/:day`, `POST/PATCH/DELETE /api/v1/log/entries`, `GET/POST/PATCH/DELETE /api/v1/foods`. New tables `foods`, `log_entries`, `daily_summaries` (summaries are rewritten in the same transaction as every entry write). Seed adds three library foods each for Finn and Tess. `pnpm ai:smoke` prints the five canonical inputs against the live model; `--record` refreshes the fixtures.
- Shared: FoodEstimate schema for Structured Outputs, portion scaling and day totals as pure functions, meal inference and the 04:00 rule, local-midnight date helpers.

### Slice 2 - Onboarding and targets (2026-09-25)
- Onboarding: after signing up you answer one question per screen (units, sex, birthday, height, weight, optional body fat, goal, pace and goal weight, activity, training, diet pattern, allergies, dislikes, health questions), review the answers and get a plan. Closing the app mid-way resumes where you left off. Under-18s are refused; pregnancy, breastfeeding or a history of disordered eating switches the plan to maintenance with a note to seek professional guidance.
- Targets: energy as the hero number with its maintenance and pace breakdown, protein, carbs, fat and fibre, the limits (added sugar, saturated fat, sodium, alcohol), water for training and rest days, ten vitamins and minerals, and food-group serves. Every number shows the reasoning behind it.
- Overrides: tap any target to change it. Inside the usual range it saves quietly, outside it warns, below a safety floor it asks you to confirm. Changing energy, protein or fat re-balances the rest so the macros still add up. "Use recommended" puts a target back.
- AI explanation: a short plain-English reading of your plan (headline, a few paragraphs, three habits, caveats), written from the computed numbers and cached until something changes. If the AI is unavailable the targets still work and you get a retry.
- Profile: edit anything; saving recomputes the targets when a relevant answer changed and records the new weight as today's weigh-in. Target history lists every version with the date, weight, goal and key numbers.
- You and Today now show your profile summary and today's targets.
- Nutrition engine (`packages/shared`): Mifflin-St Jeor or Katch-McArdle, activity multipliers, pace adjustment with the 25% deficit and 20% surplus clamps and the sex floor, protein by g/kg with training and age modifiers, fat share with the 0.5 g/kg floor, carbs as the remainder with the training check, fibre, sugar and saturated fat limits, water, DRIs by sex and age band, food-group serves. Golden tests pin Finn and Tess to the worked examples.
- API: `GET/PUT /api/v1/profile`, `GET /api/v1/targets`, `GET /api/v1/targets/history`, `PATCH /api/v1/targets/overrides`, `POST /api/v1/targets/explain`. New tables `profiles`, `target_versions`, `weight_entries`, `ai_calls`. Every OpenAI call is logged with model, tokens and latency. `pnpm ai:smoke:plan` prints live explanations for Finn and Tess.

### Slice 1 - Foundation: monorepo, auth, deploy (2026-09-25)
- You can create an account, sign in, stay signed in across refreshes and redeploys, and sign out. Wrong passwords get a clear message; ten failed attempts on one account lock it for 15 minutes.
- Installable phone app shell: Today, Log (+), Week and You tabs, a bottom sheet for quick add, dark and light themes with a manual override, offline banner, iOS add-to-home-screen hint and Android install prompt.
- Placeholders on Today, Week and You that say what arrives in the next slices.
- Local development: docker compose Postgres, `.env.example`, migrations, seed accounts for Finn and Tess, tests against a real database, CI on every push.
- Deploy: multi-stage Dockerfile, `railway.json` healthcheck, migrations on boot, README steps for creating the Railway project.

### Planning (2026-09-25)
- Project charter in `CLAUDE.md`, slice plan in `docs/PLAN.md`, decision log in `docs/DECISIONS.md` (D1 to D10 accepted by the owner).
- Project skills: `slice`, `nutrition-engine`, `ai-food-estimation`, `mobile-ui`, `db-schema`, `railway-deploy`.
- No application code yet.
