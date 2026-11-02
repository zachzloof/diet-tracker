# Coach tools, briefing, state and API mechanics

Shapes, not code. Zod lives in `packages/shared/src/coach/`; keep this file and the code in step. Strict function tools: every field required, optionals as `| null`, no additional properties.

## The briefing (built in code every turn, about 1,500 tokens)

```
Briefing {
  today: 'YYYY-MM-DD', weekday, timezone, local_time 'HH:mm'
  person: { sex, age, height_cm, weight_kg (latest weigh-in), goal, pace, activity,
            training_days_per_week, diet_pattern, allergies[], dislikes[], preferences (water/workouts/macros only),
            energy_uncapped }
  targets: [{ key, label, value, unit, reason, pinned }]    // shown keys only (preferences), from the current version
  day_met_rule: string                                      // in words, from dayMetRule(goal, energyUncapped)
  today_so_far: { logged, energy_kcal eaten/target, protein, carbs, fat, fibre, water, status per shown key, entries_count, meals_logged[] }
  this_week: { days_logged, days_met, streak, per shown key: { average, target, days_met }, gaps: [{ rule, key, severity, evidence }] }
  gym_this_week: { sessions, planned, sets, volume_kg, minutes, trained_days[], biggest_gain, biggest_drop } | null (workouts off)
  today_session: { title, exercises[], sets, volume_kg, finished } | null
  weight: { latest, trend_kg_per_week, change_28d, weigh_ins_28d } | null
  recalibration: { status: 'not_yet' | 'proposed' | 'snoozed' | 'applied', proposal? } 
  notes: [{ text, created }]                                // coach notes the person has kept (slice 11b), oldest first, "None yet." when empty
}
```
Rendered as labelled lines, not JSON, in the system prompt (lines cost fewer tokens and the weekly review showed the model reads them well).

## Read tools (wrap existing services; `userId` from the session, never an argument)

| Tool | Arguments | Returns | Service |
|---|---|---|---|
| `get_day_food` | `{ day }` | entries grouped by meal (name, quantity, unit, kcal, protein, carbs, fat, confidence), totals, scores per shown key, met | `log-service.getDay`, `evaluateDay` |
| `get_week_food` | `{ week_end }` | seven scored days (met, energy, protein, status line), averages, gaps with evidence | `stats-service.weekStats` |
| `get_month_food` | `{ month }` | per day: logged, met, energy, protein; counts | `stats-service.monthStats` |
| `get_targets` | `{}` | every target with reason and pin, the version history (dates and what changed) | `targets-service` |
| `get_gym_week` | `{ week_end }` | sessions (title, day, sets, kg, minutes), week totals, week on week per lift | `workouts-service.listWorkouts`, `compareWeeks` |
| `get_workout` | `{ id }` or `{ day }` | the session document: exercises, sets (weight, reps, time, distance), notes, feel | `workouts-service.getWorkout` |
| `get_lift_history` | `{ exercise_id \| exercise_name, sessions: 1..20 (null = 5) }` | the exercise matched by id or by a name fragment (recently used first, exact name wins, other matches listed), best set per session on the person's basis (`liftMetric`, as the lift page), best, latest, the change first to last in the window | `exercises-service.exerciseHistory`, `bestSetBy` |
| `get_weight_history` | `{ days: 7..183 (null = 28) }` | weigh-ins (last 40 points), the seven-day trend, rate in kg a week, change, goal weight, expected pace | `weight-service.listWeights`, `weightTrend`, `weightRate` |
| `get_recalibration` | `{}` | the assessment: enough data?, proposal, reasons | `recalibration-service.assess` |
| `search_my_foods` | `{ query }` | up to 20 verified foods: name, serving, kcal, protein per serving | `foods-service` |
| `search_meals` | `{ query }` | up to 20 saved meals: name, items, totals | `saved-meals-service` |
| `list_exercises` | `{ query \| muscle_group }` | catalogue and own exercises | `exercises-service` |
| `get_weekly_review` | `{ week_end }` | the cached AI review if one exists (never generates one) | `weekly_reviews` |

Result caps: 20 entries, 20 sessions, 20 foods, 20 meals, 30 exercises, 40 weigh-in points, 12,000 characters per output; numbers rounded as the screens round them (whole kcal and grams, one decimal on kg); units in labels; `{ empty: true, reason }` when there is nothing, for a future day, for another person's id and for a name that matches no exercise. Every argument with a default is `| null` (strict tools): `week_end: null` is the week ending today, `month: null` this month.

## Draft tools (slice 11b; return cards, nothing is written)

A draft tool returns `{ card, summary }`. The card (zod in `packages/shared/src/coach/cards.ts`, every kind with `id`, `kind`, `state: 'drafted' | 'confirmed' | 'dismissed'`) is stored on the assistant message and streamed as a `card` event; the model is told `{ card_id, ...summary }` and nothing else. Every card ends with "nothing happens until they tap" in its `shows` line so the model never claims the action.

| Tool | Arguments | Card | Confirm goes to |
|---|---|---|---|
| `draft_food_log` | `{ text (≤500), day \| null (today), meal \| null (inferred) }` | `estimate`: `{ text, result: EstimateResponse }`, the estimator's answer with the day and meal overridden by the arguments; a future day is `empty`; the estimator's cap or "unclear" error goes back to the model as words | `POST /api/v1/log/entries` through `EstimateReview` (items editable, meal and day pickers, save to My foods, Add to meals) |
| `draft_target_change` | `{ key, value \| null (null = clear the pin), reason (≤200) }` | `target_change`: `{ key, label, unit, before, after, value, pinnedBefore, recommended, floor, warning, dependants: [{ key, label, unit, before, after }], reason }`; `after` and the dependants come from `computeTargets(inputs, nextOverrides)`, so they are exactly what the patch would produce; a value under the floor returns `{ refused, reason, floor, note }` and no card; clearing a pin that is not there is refused; an unknown key is `empty` | `PATCH /api/v1/targets/overrides` with `{ overrides: { [key]: value }, confirm: false }` |
| `draft_workout` | `{ title (≤60), day \| null (today), exercises: [{ exercise_id \| null, exercise_name, sets: [{ weight_kg \| null, reps \| null, time_s \| null, distance_m \| null }] }], notes (≤300) }` | `workout`: `{ title, day, exercises: [{ exerciseId \| null, exerciseName, measures, sets, last: { day, sets } \| null }], notes }`; each exercise resolved by id, else exact name, else a used partial match; `last` is `exerciseHistory(…, 1)`; unmatched names keep the block with `exerciseId: null` and are listed in the summary; a future day is `empty` | the session screen: Start builds a `WorkoutInput` with fresh ids and `drafts.start`s it (client-side, saves itself) |
| `draft_meal` | `{ name (≤80), items: [{ food_id, amount, unit: 'g' \| 'serving' }] (≤20), meal \| null }` | `meal`: `{ name, items: SavedMealItem[], totals: { energy_kcal, protein_g, carbs_g, fat_g } (whole), meal }`; each item is `portionOf(food, grams)` rounded, as the meal editor snapshots it; a missing or foreign id, or `serving` on a per-100 g food, is left out and named; nothing usable is `empty` | `POST /api/v1/meals` |
| `remember_note` | `{ text (≤200) }` | `note`: `{ text }` (whitespace collapsed) | `POST /api/v1/coach/notes` |

Status lines: `draft_food_log` "Estimating "2 eggs and toast"" (cut at 40 characters); `draft_target_change` "Checking what 2,300 kcal energy would change" / "Checking what clearing your energy pin would change"; `draft_workout` "Planning Upper body"; `draft_meal` "Putting together "Big oats""; `remember_note` "Drafting a note to remember".

The client renders each kind with its own component under `features/coach/cards/` inside `CardFrame` (confirm and Dismiss while drafted; a chip afterwards). After the person's action the client calls `PATCH /coach/threads/:id/cards/:cardId` with `{ state: 'confirmed' | 'dismissed' }`; the first state sticks, so a later call cannot undo it.

## Threads and messages

```
coach_threads   { id uuid v7, user_id, title (first message, cut to 60 chars), turns int (user messages), created_at, updated_at }
coach_messages  { id, user_id (repeated for the cap count and scoping), thread_id, role 'user' | 'assistant', text,
                  cards jsonb (empty until 11b), tool_trail jsonb [{ name, arguments, summary, ms, ok }],
                  ai_call_ids uuid[], error text | null (the failure, text then holds the failure copy), created_at }
coach_notes     { id, user_id, text, created_at }   // slice 11b, migration 0015; at most COACH_MAX_NOTES (30) per person
```
There is no `replay` column: earlier turns go back to the model as plain messages (SKILL.md, "State"). `cards` holds `CoachCard[]` (slice 11b); `setCardState` rewrites the one card's `state` in place. Retention: `coach_threads` by `updated_at` older than `RETENTION_DAYS` (cascade to messages); notes kept until deleted. Export: `coachThreads` (each thread with its messages and cards) and `coachNotes` (schema 5; D24). Indexes: `(user_id, updated_at)`, `(thread_id, created_at)`, `(user_id, created_at)` on messages, `(user_id, created_at)` on notes. The list hides threads with `turns = 0` (created, nothing sent) and shows at most 50.

## Routes

| Route | Answer |
|---|---|
| `GET /api/v1/coach/threads` | `{ threads }`, newest activity first |
| `POST /api/v1/coach/threads` | 201 `{ thread }` (empty; the web creates one on the first send) |
| `GET /api/v1/coach/threads/:id` | `{ thread, messages }` oldest first; 404 for another person's |
| `DELETE /api/v1/coach/threads/:id` | 204 |
| `POST /api/v1/coach/threads/:id/messages` `{ text }` | SSE `status*`, `card*`, `delta*`, `done`; `?stream=false` → `CoachTurnResponse` JSON |
| `PATCH /api/v1/coach/threads/:id/cards/:cardId` `{ state: 'confirmed' \| 'dismissed' }` | `{ message }` with the card's new state; a card already confirmed or dismissed keeps its first state; 404 for another person's thread or an unknown card; 400 for any other state |
| `GET /api/v1/coach/notes` | `{ notes }`, newest first |
| `POST /api/v1/coach/notes` `{ text }` | 201 `{ note }`; 400 empty or over 200 characters; 409 `conflict` at 30 notes ("Delete one under Coach > Notes") |
| `DELETE /api/v1/coach/notes/:id` | 204; 404 for another person's |

## Status lines (what the person sees while a tool runs; kept as `tool_trail.summary`)

`get_day_food` "Looking at yesterday" / "Looking at Tue 27 Oct"; `get_week_food` "Looking at this week" / "Looking at the week ending ..."; `get_month_food` "Looking at October 2026"; `get_targets` "Checking your targets"; `get_gym_week` "Looking at this week's sessions"; `get_workout` "Opening that session" / "Looking at yesterday's session"; `get_lift_history` "Looking at your last 5 squat sessions"; `get_weight_history` "Looking at your last 28 days of weigh-ins"; `get_recalibration` "Checking the plan check"; `search_my_foods` "Searching My foods for "...""; `search_meals` "Looking at your meals"; `list_exercises` "Looking through exercises"; `get_weekly_review` "Reading the weekly review".

## Responses API mechanics (checked 2026-11-01 against the installed SDK 7.23.0 and developers.openai.com)

- Function tools: `{ type: 'function', name, description, parameters, strict: true }`. `zodResponsesFunction({ name, description, parameters: zodSchema })` from `openai/helpers/zod` builds one and `responses.parse` fills `parsed_arguments` on each `function_call` item; with `responses.create` (needed for streaming) parse `arguments` with the tool's zod schema yourself.
- A response's `output` may hold several `function_call` items (parallel). Answer each with `{ type: 'function_call_output', call_id, output: string }` appended after the model's own output items (`toResponseInputItems(response.output)` from `openai/lib/responses/ResponseInputItems` keeps reasoning items intact), then call again. Built-in tools (web search) cannot be in a parallel batch; the coach does not offer web search.
- State: with `store: false` nothing is kept at OpenAI (30-day retention otherwise); replay the full `input` each turn and ask for `include: ['reasoning.encrypted_content']` so reasoning items can be replayed. `previous_response_id` and `conversation` require stored responses. Input tokens are billed on every turn for the whole replay; hence the 12-turn replay window and the one-line summaries.
- Streaming: `stream: true` yields typed events; the ones the coach forwards are `response.output_text.delta` (text), `response.output_item.added` / `response.function_call_arguments.done` (a tool call is coming, emit `status`), `response.completed` (usage in `response.usage`), `error`. Usage arrives only on `response.completed`.
- `reasoning: { effort: 'low' }` only on reasoning models (the existing `reasoningOptions` helper); `max_output_tokens` 700 for the answer round.
- The Agents SDK (`@openai/agents`) would give the loop, handoffs and sessions for free but adds a dependency category, pushes session state to OpenAI by default and hides the per-round `ai_calls` logging; D41 keeps the loop in our code (about 150 lines) on the package already installed.

## Canonical smoke questions (Finn and Tess, seeded weeks)
1. "How am I doing this week?"
2. "What should I eat tonight to hit my protein?"
3. "Why is my fat target 80 g?"
4. "Am I getting stronger on squat?"
5. "I'm 300 kcal short most days, should I change my target?" (expects a `target_change` card or a reason not to)
6. "Log 2 eggs and toast for breakfast" (expects an `estimate` card, nothing written)
7. "Plan me a 45 minute upper body session like last week's" (expects a `workout` card)
8. "Is my weight trending the right way?"
9. "What am I lacking?" (must match the Week screen's gaps)
10. "What did I eat on Tuesday?" (a day with no entries must be reported as empty)
11. "Remember that my left knee is sore" (expects a `note` card; the answer may add the one-sentence professional pointer)

Checks per answer: every number appears in the briefing, a tool result or a card; no food conflicts with diet pattern, allergies or dislikes; no medical claim; under 120 words unless the question asked for detail; the tool trail is plausible (question 1 needs no tool; question 4 uses `get_lift_history`; question 7 reads last week with `get_gym_week` or `get_workout` before `draft_workout`); the expected card kind was drafted (5 to 7 and 11) and the answer never claims the action happened.
