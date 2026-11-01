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
  notes: [{ text, created }]                                // coach notes the person has kept (phase 2)
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
| `get_lift_history` | `{ exercise_id \| exercise_name, sessions: 1..20 }` | best set per session on the person's basis, best ever, latest, estimated trend | `workouts-service`, `bestSetBy` |
| `get_weight_history` | `{ days: 7..183 }` | weigh-ins, trend per week, change | `weight-service.listWeights`, `weightTrend` |
| `get_recalibration` | `{}` | the assessment: enough data?, proposal, reasons | `recalibration-service.assess` |
| `search_my_foods` | `{ query }` | up to 20 verified foods: name, serving, kcal, protein per serving | `foods-service` |
| `search_meals` | `{ query }` | up to 20 saved meals: name, items, totals | `saved-meals-service` |
| `list_exercises` | `{ query \| muscle_group }` | catalogue and own exercises | `exercises-service` |
| `get_weekly_review` | `{ week_end }` | the cached AI review if one exists (never generates one) | `weekly_reviews` |

Result caps: 20 entries, 20 sessions, 20 foods; numbers rounded as the screens round them; units in labels; `{ empty: true, reason }` when there is nothing.

## Draft tools (return cards; nothing is written)

| Tool | Arguments | Card | Confirm goes to |
|---|---|---|---|
| `draft_food_log` | `{ text, day, meal \| null }` | `estimate`: the FoodEstimate items as the review card shows them | `POST /api/v1/log/entries` (existing confirm) |
| `draft_target_change` | `{ key, value \| null (null = unpin), reason }` | `target_change`: before, after, the engine's recomputed dependants (fat and carbs when energy or protein moves), the floor check | `PATCH /api/v1/targets/overrides` |
| `draft_workout` | `{ title, exercises: [{ exercise_id, sets: [{ weight_kg \| null, reps \| null, time_s \| null, distance_m \| null }] }], notes }` | `workout`: the plan with last-time numbers beside each set | opens the session screen with the draft (client-side) |
| `draft_meal` | `{ name, items: [{ food_id, quantity, unit }] }` | `meal`: the meal and its totals | `POST /api/v1/meals` |
| `remember_note` | `{ text }` | `note`: the line to keep | `POST /api/v1/coach/notes` (phase 2) |

Card schemas are zod in `packages/shared/src/coach/cards.ts`; the client renders each with the existing component (`EstimateReview`, the energy sheet's before/after, the session screen) so the confirm path is the one already tested.

## Threads and messages

```
coach_threads   { id uuid v7, user_id, title (first message, trimmed), created_at, updated_at, turns int }
coach_messages  { id, thread_id, role 'user' | 'assistant', text, cards jsonb, tool_trail jsonb
                  [{ name, arguments, summary, ms }], ai_call_ids uuid[], error text | null,
                  replay jsonb (the exact Responses output items of the assistant turn, incl. reasoning), created_at }
coach_notes     { id, user_id, text, created_at }   // phase 2
```
Retention: `coach_threads` by `updated_at` older than `RETENTION_DAYS` (cascade to messages); notes kept until deleted. Export: both tables as JSON (D24). Indexes: `(user_id, updated_at)`, `(thread_id, created_at)`.

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

Checks per answer: every number appears in the briefing or a tool result; no food conflicts with diet pattern, allergies or dislikes; no medical claim; under 120 words unless the question asked for detail; the tool trail is plausible (question 1 needs no tool; question 4 uses `get_lift_history`).
