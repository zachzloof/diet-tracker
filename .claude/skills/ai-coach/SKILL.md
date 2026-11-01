---
name: ai-coach
description: How Minori's coach works - one OpenAI agent (Responses API, function tools from zod, a tool loop owned by the API) that reads a person's food log, targets, scores, gaps, workouts, lifts and weigh-ins through typed read tools, drafts actions as cards the person confirms, keeps its threads in Postgres with store false, and streams its answer to the phone over SSE. Use whenever building or changing anything under apps/api/src/ai/coach, the coach routes, the coach_* tables, the /coach screens, the coach tools or prompt, the coach smoke test, or when the owner says "coach", "ask the AI", "chat", "agent" or "the genius".
---

# AI coach

## Why it is shaped this way
Everything the app knows about a person already exists as typed, deterministic data: scored days, ranked gaps, week comparisons, best sets, weight trend, recalibration status. The coach's job is to put all of that at the model's hand and let a person ask anything, in plain words, on a phone. What makes it trustworthy is the same four things as the estimator: fast, consistent, honest about what it looked at, and easy to act on or correct. So:

- **One agent, many tools, no handoffs.** A specialist-per-domain design would cost a round trip per handoff on a phone and split one person's context in two. The specialists are the deterministic functions in `packages/shared` behind the tools. Split into agents only if the prompt or the tool list stops fitting; say so in D41 first.
- **Pre-brief, then tools.** Every turn starts with a compact briefing built in code (profile, targets, today so far, this week, gym week, weight trend, recalibration status, open gaps). Most questions need no tool call; the model reaches for a tool only to drill down (one day, one lift, a month, a food search).
- **The coach never writes.** It drafts: an estimate to log, a target pin to apply, a workout to start, a meal to save, a note to remember. Each comes back as a card the person confirms with a tap, and the confirm goes through the existing endpoint. Non-negotiable 2 holds: AI never sets targets, and no model output reaches a table without a human tap and a zod parse.
- **Numbers come from tools, never from memory.** The prompt forbids numbers that are not in the briefing or a tool result. The smoke test traces every number in the answer back to the data it was given.

## Contract
- **SDK**: the `openai` package already installed (7.x). **API**: Responses, `client.responses.create` with `tools` built by `zodResponsesFunction` (strict function tools from zod; every field required, optionals as `| null`, `additionalProperties: false`), `parallel_tool_calls: true`, `store: false`, `include: ['reasoning.encrypted_content']` so replayed turns keep their reasoning items. The tool loop lives in `apps/api/src/ai/coach/agent.ts`: at most `COACH_MAX_TOOL_ROUNDS` (6) model rounds per turn; each round is one `ai_calls` row with purpose `coach`.
- **Model**: `OPENAI_COACH_MODEL`, defaulting to `OPENAI_MODEL` (D6 one strong model; the override exists so the owner can try a cheaper tier for chat without touching estimation). Reasoning effort `low`; the briefing does the thinking.
- **State**: threads and messages live in our Postgres (`coach_threads`, `coach_messages`), under the six-month retention (D27), inside the export (D24) and the cascade delete. Each turn replays the thread as `input` (user and assistant messages, function calls and their outputs, reasoning items). OpenAI's `previous_response_id` and Conversations API are not used: they need `store: true` and keep the person's data at OpenAI (D41 option B). A thread is capped at `COACH_MAX_TURNS` (40) turns; after that the composer offers "New chat".
- **Streaming**: `POST /api/v1/coach/threads/:id/messages` answers `text/event-stream`. Events: `status` (a short line for a tool call, "Looking at this week"), `delta` (assistant text), `card` (a drafted action), `done` (the stored message with ids and usage), `error`. The browser reads it with `fetch` and a `ReadableStream` (EventSource cannot POST). A `?stream=false` fallback returns the whole message as JSON for tests and for the smoke script.
- **Server only.** The key never reaches the browser. The web app calls `/api/v1/coach/*`. Threads are scoped by `user_id` from the session; every tool receives `userId` from the request, never from the model.
- **Consent** (D25): the coach shows `AiConsent` until AI features are allowed, and its copy names what the coach adds to what is sent: the food log for the days it looks at, workouts and weigh-ins. The weekly-review and estimate flows are unchanged.

## The tools
Full catalogue with argument and result shapes in `references/tools.md`. Rules:
1. **Read tools wrap existing services.** `stats-service`, `log-service`, `workouts-service`, `weight-service`, `targets-service`, `recalibration-service`, `foods-service`, `saved-meals-service`. A tool never runs SQL of its own; if a query is missing, add it to the service with a test.
2. **Results are compact and labelled.** Round as the screens do (`fmt` in the weekly review), name units in the field labels, cap lists (20 entries, 20 sessions), and never return a raw row. Token cost is per turn, and the result is replayed on every later turn of the thread.
3. **Days are the user's local day.** Tools take `YYYY-MM-DD`; "today" is resolved in code from `profiles.timezone` and stated in the briefing. The model never computes a date from server time.
4. **Draft tools return cards, not writes.** `draft_food_log` runs the estimator (`estimate.ts`, same cap and memory) and returns the estimate as an `estimate` card; `draft_target_change` validates the pin against the engine (`setOverrides` dry run) and returns a `target_change` card with the before and after; `draft_workout` returns a `workout` card built from the catalogue and the person's recent sessions; `draft_meal` and `remember_note` likewise. The client renders the card with the existing review components and the confirm hits the existing endpoint. The tool result tells the model what the card shows so it can refer to it in words.
5. **Honest emptiness.** A tool with nothing to show returns `{ empty: true, reason }` ("no entries on 2026-10-30"); the model says so rather than guessing.

## Prompt rules (and why)
1. **Second person, plain, specific, short.** Phone screen: lead with the answer, then one reason, then one next step. Under 120 words unless asked for detail.
2. **Quote numbers as given**, with units, from the briefing or a tool result; never invent a number, a day, a food or a set. If the data is not there, say what you would need.
3. **Targets are the engine's.** Explain them from their `reason` lines; propose changes only as a `draft_target_change` card and say the person decides. Never suggest going under the safety floors (`nutrition-engine` skill).
4. **No medical advice, no diagnosis, no supplements as treatment.** Point to a professional for pain, illness, disordered eating signals or pregnancy.
5. **Respect the diet pattern, allergies, dislikes and preferences** in every food suggestion; the briefing lists them.
6. **Say what you looked at** when a tool was used ("Looking at your last 5 squat sessions"), so the person can tell data from opinion.
7. **Goal-aware.** The day-met rule for the person's goal is stated in the briefing in words (as the weekly review does), and an uncapped energy target is explained as a floor (D40).
8. **Training day awareness.** The briefing says whether today has a session and what the week's plan is (`training_days_per_week`), so "what should I eat tonight" can account for it.

## Flow for one turn
1. Validate the message (trim, cap at 1,000 characters, reject empty). Check consent is implied by the call (the web app gates it); check the turn cap (`AI_COACH_DAILY_TURN_CAP`, default 60 turns per local day, counted from `coach_messages` with role `user`) and the thread length cap.
2. Store the user message. Build the briefing from the services (one query batch, about 1,500 tokens).
3. Replay the thread into `input` after the system prompt and the briefing. Older turns beyond the last 12 are replaced with their stored one-line summary.
4. Loop: call the model with the tools; for each `function_call` item parse the arguments with the tool's zod schema (a parse failure is returned to the model as a `function_call_output` error string, once), run it with `userId`, append `function_call_output`; stop when the response has no function calls or the round cap is hit (then ask the model to answer with what it has, tools off).
5. Stream text deltas as they arrive on the final round; emit `card` events as draft tools return.
6. Store the assistant message with its text, cards, the tool trail (name, arguments, a result summary) and the `ai_calls` ids. Emit `done`.
7. On any failure after the user message was stored, store an assistant message with `error` set so the thread shows "The coach is unavailable right now" with a retry, and emit `error`.

## Cost and abuse guards
Per-user daily turn cap separate from the estimator's call cap (both count in `ai_calls`); round cap per turn; thread turn cap; message length cap; tool result size caps; `max_output_tokens` 700 on answers. The briefing is rebuilt each turn rather than cached so it never goes stale, which is the main token cost; keep it compact. Every round logs tokens, so `ai_calls` grouped by purpose and user is the bill.

## Failure copy
"The coach is unavailable right now. Your question is kept; try again in a moment." Never show raw errors; log them.

## Code
`apps/api/src/ai/coach/`: `agent.ts` (the loop and streaming), `briefing.ts` (the pre-brief builder, pure given its inputs, unit-tested), `prompt.ts` (system prompt), `tools/` (one file per tool: zod args, run function, result shape), `threads-service.ts` (threads and messages), `routes.ts`. Shared: `packages/shared/src/coach/` for the thread and message wire schemas, the card schemas and the tool argument schemas (so the web app types cards from the same source). Web: `apps/web/src/features/coach/`.

## Testing
- **Unit**: the briefing builder against Finn's and Tess's seeded weeks; each tool against real Postgres (scoping: a tool asked about another user's id returns empty); the loop with a fake client that returns scripted function calls (round cap, bad arguments, parallel calls, streaming events in order).
- **Smoke** (`pnpm ai:smoke:coach [--record]`, not in CI): the canonical questions in `references/tools.md` against the live model as Finn and Tess; prints each answer, the tools used, tokens and latency; checks that every number in the answer appears in the briefing or a tool result, and that no suggestion conflicts with the diet pattern, allergies or dislikes. Paste the table into the slice report.
- **Walk**: the `/coach` screen at 360, 390 and 430 wide, dark and light, with the keyboard open (the composer stays above it, the list scrolls under), a streamed answer, a card confirmed, offline (composer disabled with a line), consent not yet given.
