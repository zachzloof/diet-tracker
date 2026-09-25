# Development plan

The app is built in five slices. Each slice is one working session, produces something the owner can open on their phone, and ends with a commit on `main`. Slices are started only when the owner asks ("do slice 2"). The `slice` skill carries the working loop.

Two personas run through every slice as seed data, golden tests and manual checks:
- **Finn**: male, 28, 178 cm, 75 kg, fighter, trains 6x/week, wants a lean gain of 0.25 kg/week.
- **Tess**: female, 30, 160 cm, 50 kg, gym 3x/week, wants to lose 0.25 kg/week and tone.

Status legend: `not started`, `in progress`, `done`, `done with deferrals`.

---

## Slice 1 - Foundation: monorepo, auth, deploy

**Status:** done with deferrals (2026-09-25)

**Goal.** A deployed, installable shell that you and your friends can sign into from your phones. Everything later builds on this, so it is mostly plumbing done properly.

**In scope.**
- pnpm workspace with `apps/web`, `apps/api`, `packages/shared`. Strict TypeScript, shared ESLint + Prettier, Vitest, root scripts (`dev`, `build`, `typecheck`, `lint`, `test`, `db:*`).
- `packages/shared`: zod schemas for auth and env, the `NutrientKey` enum and units (so later slices never invent their own), and the nutrition engine folder with a placeholder test.
- `apps/api`: Hono app, zod-validated env, structured logging, request IDs, error format, `GET /api/health`, Drizzle + Postgres with the `users` and `sessions` tables and first migration, static serving of the built SPA with fallback.
- Auth: register, login, logout, `GET /api/v1/me`; argon2id hashes; DB sessions; `Secure; HttpOnly; SameSite=Lax` cookie; rate limit on auth routes; session renewal.
- `apps/web`: Vue 3 + Vite + TS, vue-router with auth guard, Pinia, TanStack Query, Tailwind v4 with the design tokens from the `mobile-ui` skill, app shell (safe areas, bottom tab bar with placeholder tabs), auth screens, a "Today" placeholder, PWA manifest and service worker (installable with icon and splash), install hint for iOS.
- Local: `docker-compose.yml` for Postgres, `.env.example`, seed script creating Finn and Tess.
- Deploy: multi-stage Dockerfile, `railway.json` with healthcheck, migrations on boot, docs for setting up the Railway project and variables.
- GitHub Actions: typecheck + lint + test on push.

**Out of scope.** Onboarding, targets, logging, any nutrition UI.

**Done when.**
- [ ] From a phone, open the Railway URL, add to home screen, and the app launches full-screen with an icon. *Deferred: needs the owner to create the Railway project (README has the steps) and a real phone. Verified locally instead: manifest with 192/512/maskable icons, service worker registers, iOS add-to-home-screen hint shows under a Safari user agent, and the Docker image boots and serves the app.*
- [x] Register, log out, log in; refreshing keeps you logged in; sessions survive a redeploy. *Walked in a 390x844 headless browser; a cookie issued by one server process was accepted by a freshly booted container against the same database.*
- [x] Wrong password shows a clear error; ten rapid failed logins get rate limited. *"Email or password is incorrect"; the eleventh attempt shows "Too many attempts. Try again in 15 minutes." with a 429 and Retry-After.*
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test` pass locally and in CI. *Locally green (30 tests). CI workflow committed; its first run happens on this push.*
- [x] Fresh clone + `docker compose up -d db` + `pnpm db:migrate` + `pnpm dev` works by following the README. *Done from a fresh clone into a temp directory.*
- [x] Decisions D1 to D4 marked `accepted` in `docs/DECISIONS.md` (or superseded with the owner's choice).

**Decisions it depends on.** D1, D2, D3, D4.

---

## Slice 2 - Onboarding and targets

**Status:** done with deferrals (2026-09-25)

**Goal.** The app knows the person and gives them daily targets a dietitian would call sensible, with the reasoning visible.

**In scope.**
- Nutrition engine in `packages/shared` (see the `nutrition-engine` skill): `computeTargets` with BMR/TDEE, goal and pace adjustment with floors and flags, protein g/kg by goal, fat % with g/kg floor, carbs remainder, fibre, sodium, saturated fat, added sugar, water, micronutrient DRIs by sex and age, food-group serves. Golden tests for Finn and Tess plus edge cases (very overweight, older adult, low-carb pattern, pregnancy flag, body fat given).
- DB: `profiles`, `target_versions`, `weight_entries`.
- Onboarding flow: multi-step, resumable, one question per screen where possible. Sex (for the formula, with "prefer not to say"), date of birth, height, weight, body fat (optional), goal (lose / maintain / gain / recomp), goal weight and pace, activity level, training type and frequency, diet pattern, allergies and intolerances, dislikes, timezone (auto), units. Safety flags per D10.
- Targets screen: every target with its reason, an AI-written plan explanation (first OpenAI call, structured, cached on `target_versions`), per-target override with range validation and warnings, recompute on profile change with history kept.
- Profile screen: edit anything, see when targets last changed.

**Out of scope.** Food logging, dashboard.

**Done when.**
- [ ] A new user completes onboarding on a phone in under three minutes without confusion (no field needs explanation beyond its label and helper text). *Deferred: the timing needs a real person on a real phone. Verified instead in a 390x844 headless browser: 14 screens (15 when a pace applies), only four need typing, every field has a label and helper text, the draft survives a reload, and an under-18 date of birth is refused inline.*
- [x] Finn and Tess get the numbers in `nutrition-engine/references/targets.md` exactly (golden tests) and the screen shows the same numbers. *44 shared tests including both goldens and 13 edge cases; the targets screen was checked for 14 of Finn's numbers, and the seeded Finn account shows 3,250 kcal and 150 g.*
- [x] Overriding protein to 180 g sticks after refresh; overriding energy below the floor shows the warning. *Protein 180 g saved with the "above the usual range of 120 to 165 g" warning and survived a reload (carbs re-balanced to 430 g). Energy 1500 kcal shows "below the safe minimum of 1730 kcal" and needs a second "Save anyway" tap.*
- [x] The AI explanation reads naturally, mentions the actual numbers, and never contradicts the engine. *Generated live with `gpt-5.5` for Finn and Tess (the account cannot use `gpt-5` without organisation verification, see D11). Both quoted every number as given and respected the allergy and dislikes. Finn's answer is the recorded fixture. "Never contradicts" is enforced by the prompt and by dropping the cached text whenever an override changes; it is not checked mechanically.*
- [x] Changing weight in Profile creates a new `target_versions` row and the old one stays visible in history. *75 kg to 77 kg produced a second version (3,290 kcal) with the 75 kg version still listed; the protein override carried across.*

**Decisions it depends on.** D6, D7, D8, D10. Surfaced D11 (model access), D12 (override semantics) and D13 (what the explanation call sends).

---

## Slice 3 - Food logging: AI quick-add, manual entry, food library

**Status:** not started

**Goal.** Logging is fast enough that people actually do it at every meal.

**In scope.**
- Quick add: a text box on Today. "4 eggs and two slices of toast with butter" goes to OpenAI Structured Outputs (see the `ai-food-estimation` skill) and comes back as a review card listing each item with grams, key nutrients, confidence and assumptions. Edit quantity or remove items, confirm, saved as `log_entries`. A clarifying question is shown only when the ambiguity materially changes the numbers.
- Manual entry: label-style form (per 100 g or per serving), full nutrient vector with sensible defaults, food-group serves, save to "My foods".
- Foods library: my foods + recent + confirmed AI estimates; search; one-tap re-log with a portion picker; edit and delete. Re-logging a known food makes no AI call (D5 option C).
- Day log: entries grouped by meal (breakfast / lunch / dinner / snack, inferred from time and editable), edit quantity, delete, move to another day or meal.
- Today totals vs targets: simple bars for energy and macros (the full dashboard is slice 4). `daily_summaries` maintained on every write.
- Guards: per-user daily AI cap, input length cap, timeouts and retry, `ai_calls` logging with tokens, friendly failure that falls back to manual entry.
- Timezone-correct day boundaries, including a late entry belonging to the day the user thinks it is (rule: entries before 04:00 local can be assigned to the previous day with one tap).

**Out of scope.** Week view, gaps, weight tracking.

**Done when.**
- [ ] On a phone, "4 eggs" is logged in under ten seconds with plausible numbers (energy 280 to 320 kcal, protein 24 to 28 g) and the assumptions shown.
- [ ] A mixed meal ("chicken stir fry with rice, about a plate") returns several items and food-group serves that make sense.
- [ ] A manual food is saved, re-logged with a different portion, and the totals update correctly.
- [ ] Removing the OpenAI key produces a clear error and the manual path still works.
- [ ] `ai_calls` shows one row per call with token counts; the daily cap blocks further calls with a clear message.
- [ ] The AI smoke script prints the five canonical inputs with numbers a human agrees are reasonable.

**Decisions it depends on.** D5, D6, D7.

---

## Slice 4 - Dashboard and weekly insights

**Status:** not started

**Goal.** Show people where they stand and what to change, in a way that is glanceable on a phone.

**In scope.**
- Today: energy ring with remaining kcal as the hero number, macro bars, micronutrient grid with met / close / short / over status, food-group serves, water tracker with a quick +250 ml.
- Week: "days met" per target and overall, current streak, a seven-day strip you can tap to open any day's log, weekly averages vs targets.
- "Areas where you're lacking": rules from the `nutrition-engine` skill (`findGaps`) over the last seven logged days, ranked by impact, each with two or three concrete foods filtered by diet pattern and allergies.
- AI weekly review: a short structured summary (what went well, top two changes, one encouragement) generated on demand when the Week screen opens, cached per ISO week, regenerated at most once a day.
- Charts: rings and bars as small SVG components; a tiny line chart component for later weight trends. Consult the `dataviz` skill before building them.
- History: a month calendar with a day-met dot per day.

**Out of scope.** Weight tracking UI, recalibration, settings.

**Done when.**
- [ ] With seeded weeks for Finn and Tess, "days met" and the gaps list match hand-computed results from the rules.
- [ ] Today renders correctly at 360, 390 and 430 px wide, in dark and light, with no horizontal scroll.
- [ ] Week screen first paint under one second on a throttled "Fast 3G" profile with a warm cache.
- [ ] The AI weekly review references real numbers from the week and respects the user's diet pattern in suggestions.
- [ ] Tapping any day in the strip or calendar opens that day's log.

**Decisions it depends on.** D7, D8; the cron-vs-on-demand open question is settled here.

---

## Slice 5 - Progress, settings and publish-readiness

**Status:** not started

**Goal.** Something people keep using for months, and that could be submitted to an app store without embarrassment.

**In scope.**
- Weight log: quick entry from Today, trend line with 7-day moving average, goal line, rate of change vs chosen pace.
- Recalibration: every 14 days with enough data, compare average intake and weight change, propose a target adjustment (deterministic, bounded), user confirms; creates a new `target_versions` row.
- Settings: units, theme, timezone, reminders (local notifications where the PWA supports them), change password, export all data (JSON and CSV), delete account (cascades everything, confirmed twice).
- Reliability: offline read of the last cached day and targets, queued quick-adds when offline, error boundaries, skeleton and empty states everywhere, no dead ends.
- Performance and accessibility pass: Lighthouse PWA and accessibility scores at or above 90; touch targets at least 44 px; reduced-motion respected.
- Publish prep: privacy policy and terms pages (plain text), app icons at all sizes, Capacitor scaffold (`ios/`, `android/`) with a doc on building, and a note on what the App Store will ask for (Sign in with Apple if social login exists, account deletion, health disclaimer).

**Out of scope.** Photo estimation, barcodes, coach chat, social features (all listed as ideas below).

**Done when.**
- [ ] A week of daily use by the owner and one friend with no visible bugs reported.
- [ ] Export downloads a file containing every log entry; delete account removes every row for that user.
- [ ] Lighthouse PWA and accessibility at or above 90 on the deployed URL.
- [ ] Airplane mode: Today still shows the last known state and a quick-add queues and sends when back online.
- [ ] Recalibration proposes a sensible change for a seeded user whose weight stalled for two weeks.

**Decisions it depends on.** Open questions on domain and email provider.

---

## Ideas after slice 5 (not planned)

- Coach chat: a conversational agent with tools to log food, answer "how am I doing", and propose target changes.
- Photo-of-meal estimation via the vision model.
- Barcode scanning with Open Food Facts lookup.
- USDA FoodData Central as a second resolver for whole foods (D5 option B).
- Recipes: build a meal from foods and log it as one item.
- Sharing a week summary with a friend or coach.
- Apple Health / Google Fit weight sync via Capacitor.
