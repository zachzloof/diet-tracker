---
name: ai-food-estimation
description: How diet-tracker talks to OpenAI - the Responses API with Structured Outputs, the FoodEstimate schema (items, grams, full nutrient vector, food-group serves, confidence, assumptions, optional clarifying question), the PlanExplanation and WeeklyReview schemas, prompt rules, portion defaults, the per-user foods memory that avoids repeat calls, cost caps, logging, failure handling, and the smoke test with fixtures. Use whenever writing or changing any code that calls OpenAI, parses "I had ..." text, estimates nutrients, explains targets, or generates weekly insights.
---

# AI food estimation

## Why it is shaped this way
"I had 4 eggs" will never be exact, and the owner knows that. What makes it useful is that it is fast, consistent from one day to the next, honest about its assumptions, and easy to correct. Every design choice here serves one of those four.

## Contract
- **SDK**: the official `openai` package. **API**: Responses. **Output**: Structured Outputs with a zod schema from `packages/shared/src/ai/schemas.ts`, converted with `zodTextFormat` and `strict: true`, so a response that does not match the schema is a parse error, not a runtime surprise.
- **Model**: `OPENAI_MODEL` from env, one strong model for everything (D6). Never hardcode a model ID in code; IDs move.
- **Web search for named products (D16).** The estimate call also offers OpenAI's built-in `web_search` tool (`AI_WEB_SEARCH`, default on) with the person's country and time zone as the location hint. The prompt tells the model to search only when the text names a brand, retailer, chain or product, to read the retailer's or manufacturer's label, and to return `brand` and `source_url`; generic foods are never searched. Searches are billed per call and counted in `ai_calls.web_search_calls`. The call timeout is 75 s when the tool is offered.
- **Server only.** The API key never reaches the browser. The web app calls `/api/v1/ai/estimate`, `/api/v1/ai/explain-plan`, `/api/v1/ai/weekly-review`.
- **Schemas** in `references/schemas.md`: `FoodEstimate`, `PlanExplanation`, `WeeklyReview`. Structured Outputs in strict mode needs every field required and no additional properties, so optional values are expressed as nullable, and nutrient and food-group vectors list every key.

## Prompt rules (and why each one)
1. **Quote the units and serve definitions verbatim** from `nutrition-engine/references/nutrients.md`. Consistency depends on the model using the same definitions every time.
2. **Amounts are for the total quantity stated**, never per 100 g. The review card shows totals and people think in totals.
3. **When a quantity is missing, assume one typical serving and say so** in `assumptions` ("assumed 2 slices of toast"). Silent guesses are the thing users cannot correct.
4. **Ask a clarifying question only when it materially changes the numbers** (a slice of pizza vs a whole pizza; "protein shake" with no brand). Otherwise estimate and state the assumption. Questions cost a round trip on a phone; most of the time a stated assumption is better.
5. **Region and diet pattern from the profile** go in the system prompt: portion sizes differ by country, and a vegan's "burger" is not beef.
6. **Memory for consistency**: the prompt includes up to 20 of the user's own foods whose names resemble the input (from `foods` where `verified = true`), with their values, and instructs the model to reuse them for matching items. The second "my protein shake" should equal the first.
7. **Confidence is per item** (`high`, `medium`, `low`) and the review card colours it. Restaurant meals and "some" quantities are `low`; packaged foods with stated weights are `high`.
8. **No nulls in vectors.** Unknown nutrient means 0 and a lower item confidence. The aggregation code relies on complete vectors.
9. **Named products come from their label, not from memory.** "Asda mozzarella sticks" or "M&S fries" must be searched for and read from the product page; the item carries `brand`, `source_url` and `high` confidence (`medium` when the quantity had to be assumed), with the pack size or serving named in `assumptions`. If the page cannot be found the model says so, estimates from the generic equivalent, sets `source_url` null and lowers confidence. It never invents a URL; `tidyUrl` drops anything that is not an absolute http(s) URL.

## Flow for a quick-add
1. Trim and cap input at 500 characters; reject empty.
2. Check the per-user daily cap (`AI_DAILY_CALL_CAP`, default 150) against `ai_calls` for the user's local day. Over cap: 429 with a friendly message and the manual path.
3. Look up verified library matches for the prompt memory.
4. Call OpenAI with a 30 s timeout (75 s when web search is offered), one retry on 429 or 5xx with 2 s backoff.
5. Parse with zod. On parse failure, retry once with the validation error appended to the prompt; on second failure return a "could not understand that, try rephrasing or enter manually" error.
6. Write an `ai_calls` row (purpose, model, tokens, latency, ok, error) whatever the outcome.
7. Return the estimate for review. On the card the person can change the quantity or the weight (every number rescales from the original) or correct any single nutrient (only that number changes, and the corrected values become what later portion changes scale from); see `apps/web/src/features/log/item-edit.ts`. Nothing is written to `log_entries` until the user confirms; confirmed items with `confidence: high` or user-edited values may be saved to `foods` as verified, and the brand goes with them.

## Cost and abuse guards
Daily cap per user; input length cap; no AI call for library re-logs; weekly review cached per ISO week and regenerated at most daily; every call logged with token counts so the owner can see the bill per user.

## Failure copy
Short, blame-free, with the next action: "The estimator is unavailable right now. You can add this meal manually." Never show raw API errors to users; log them.

## Code
`apps/api/src/ai/openai.ts` owns the client: `callStructured({ purpose, userId, schemaName, schema, system, user, webSearch?, timeoutMs?, reasoningEffort? })` does the Responses call with `zodTextFormat`, `store: false`, reasoning effort `low` on reasoning models, the optional `web_search` tool, the timeout and retry, counts `web_search_call` output items, and writes the `ai_calls` row. Each purpose gets its own file next to it holding the prompt builder and the flow: `explain-plan.ts` (slice 2), `estimate.ts` (slice 3: cap check, library matches from `log/foods-service.ts`, the call, `tidyEstimate`, and the suggested day and meal) and `weekly-review.ts` (slice 4: builds the week from `stats/stats-service.ts`, returns the cached `weekly_reviews` row when it was generated today or the window is in the past, otherwise checks the cap, calls, trims to three wins and two changes, and upserts; decision D17). The review's user message lists every day with its numbers and verdict, the averages over logged days, the key targets with reasons, and the ranked gaps with evidence and pre-filtered suggestions, so the model has nothing to invent. `callStructured` returns the `ai_calls` id so log entries can reference the call, and retries once with the validation error appended when the answer fails zod. Model access: `gpt-5` needs a verified organisation; see D11 in `docs/DECISIONS.md`.

## Testing
- **Unit**: zod schema tests with recorded fixtures in `apps/api/src/ai/__fixtures__/` (`explain-plan-finn.json` from slice 2; `estimate-<slug>.json` for the seven canonical inputs, with range assertions on "4 eggs" and the stir fry). Run in CI, no network.
- **Plan smoke** (`pnpm ai:smoke:plan [--record]`): explains Finn's and Tess's plans with the live model and prints them; `--record` refreshes the fixture.
- **Week smoke** (`pnpm ai:smoke:week [--record]`): builds both seed weeks in memory (`db/seed-weeks.ts`), prints the gaps and the live review for each; `--record` writes `weekly-review-finn.json`. Read the review against the gap lines: every number it quotes must appear in the prompt, and no suggestion may conflict with the diet pattern, allergies or dislikes.
- **Smoke** (`pnpm ai:smoke [--record] [--only <slug>]`, not in CI): sends the seven canonical inputs to the live model and prints a table of energy, protein, grams, confidence, web searches and, for named products, brand and source URL per item for a human to sanity-check. Canonical inputs: "4 eggs"; "2 slices wholegrain toast with butter"; "chicken stir fry with rice, about a plate"; "large flat white"; "protein shake with a banana"; "asda mozzarella sticks"; "m&s fries, 150g". The two product inputs must come back with a brand, an http(s) `source_url` and high or medium confidence; the fixture test checks that. Run it whenever the prompt, schema or model changes, and paste the table into the slice report.
- **Expected ranges** for the first input: 4 large eggs, about 200 g, energy 280 to 320 kcal, protein 24 to 28 g, fat 19 to 23 g, `protein_foods` serves about 2.
