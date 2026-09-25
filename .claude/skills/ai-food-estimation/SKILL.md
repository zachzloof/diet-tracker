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

## Flow for a quick-add
1. Trim and cap input at 500 characters; reject empty.
2. Check the per-user daily cap (`AI_DAILY_CALL_CAP`, default 150) against `ai_calls` for the user's local day. Over cap: 429 with a friendly message and the manual path.
3. Look up verified library matches for the prompt memory.
4. Call OpenAI with a 30 s timeout, one retry on 429 or 5xx with 2 s backoff.
5. Parse with zod. On parse failure, retry once with the validation error appended to the prompt; on second failure return a "could not understand that, try rephrasing or enter manually" error.
6. Write an `ai_calls` row (purpose, model, tokens, latency, ok, error) whatever the outcome.
7. Return the estimate for review. Nothing is written to `log_entries` until the user confirms; confirmed items with `confidence: high` or user-edited values may be saved to `foods` as verified.

## Cost and abuse guards
Daily cap per user; input length cap; no AI call for library re-logs; weekly review cached per ISO week and regenerated at most daily; every call logged with token counts so the owner can see the bill per user.

## Failure copy
Short, blame-free, with the next action: "The estimator is unavailable right now. You can add this meal manually." Never show raw API errors to users; log them.

## Testing
- **Unit**: zod schema tests with recorded fixtures in `apps/api/src/ai/__fixtures__/` (one JSON per canonical input). Run in CI, no network.
- **Smoke** (`pnpm ai:smoke`, not in CI): sends the five canonical inputs to the live model and prints a table of energy, protein, grams and confidence per item for a human to sanity-check. Canonical inputs: "4 eggs"; "2 slices wholegrain toast with butter"; "chicken stir fry with rice, about a plate"; "large flat white"; "protein shake with a banana". Run it whenever the prompt, schema or model changes, and paste the table into the slice report.
- **Expected ranges** for the first input: 4 large eggs, about 200 g, energy 280 to 320 kcal, protein 24 to 28 g, fat 19 to 23 g, `protein_foods` serves about 2.
