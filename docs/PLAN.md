# Development plan

The app is built in five slices. Each slice is one working session, produces something the owner can open on their phone, and ends with a commit on `main`. Slices are started only when the owner asks ("do slice 2"). The `slice` skill carries the working loop. All five slices are done (2026-09-26); what remains is real-phone use, the open decisions in `docs/DECISIONS.md`, and the ideas at the bottom.

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

**Status:** done with deferrals (2026-09-26)

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
- [x] On a phone, "4 eggs" is logged in under ten seconds with plausible numbers (energy 280 to 320 kcal, protein 24 to 28 g) and the assumptions shown. *Walked in a 390x844 and a 360-wide headless browser with the live model: 288 kcal, 25 g protein, 200 g, two assumptions shown, 3.9 to 5.0 s from typing to logged including the model call. A real phone over a mobile network is still to be tried.*
- [x] A mixed meal ("chicken stir fry with rice, about a plate") returns several items and food-group serves that make sense. *Four or five items (rice, chicken, vegetables, oil and sauce) at 640 to 740 kcal; vegetables about 2.4 serves and protein foods 1.5 in the recorded fixture. Confidence is "low" on a plate-sized guess, as the prompt asks.*
- [x] A manual food is saved, re-logged with a different portion, and the totals update correctly. *A 50 g, 200 kcal bar logged once (+200 kcal), then 2.5 bars from My foods (+500 kcal), then edited to 2 bars and moved to yesterday (today −200, yesterday +400). API tests cover the same with oats per 100 g.*
- [x] Removing the OpenAI key produces a clear error and the manual path still works. *With the API started without a key: "The estimator is unavailable right now. You can add this meal manually." with Try again and Add manually (the text is carried into the form), and the manual entry saved.*
- [x] `ai_calls` shows one row per call with token counts; the daily cap blocks further calls with a clear message. *Eight rows after the walk, each with model `gpt-5.5-2026-04-23`, input and output tokens and latency. With `AI_DAILY_CALL_CAP=1` the second estimate shows "You've used today's 1 AI estimates. You can still add meals manually or from My foods; the cap resets at midnight." The cap counts every attempt since local midnight, failures included.*
- [x] The AI smoke script prints the five canonical inputs with numbers a human agrees are reasonable. *`pnpm ai:smoke --record` on 2026-09-26: 4 eggs 288 kcal / 25 g; toast and butter 270 kcal; stir fry 740 kcal in two items; large flat white 181 kcal; protein shake and banana 350 kcal with a clarifying question about the shake. The five answers are the recorded fixtures.*

**Deferrals.** No offline queue for quick-adds (slice 5). No "recent" section separate from My foods: the library sorts by last used, which covers it. Water is logged like any nutrient for now; the +250 ml tracker is slice 4.

**Follow-ups shipped (2026-09-26).** Named products are looked up online with OpenAI's web search tool and the review card links the label's page (D16). Estimate items and logged entries are editable in full: quantity or weight rescales everything, a single nutrient changes only itself. Saved AI items keep their brand. Verified with the live model in a 390x844 and a 360-wide headless browser; see CHANGELOG.

**Decisions it depends on.** D5, D6, D7. Surfaced D14 (saving confident AI items to My foods) and D15 (the client computes portions, the server stores them).

---

## Slice 4 - Dashboard and weekly insights

**Status:** done with deferrals (2026-09-26)

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
- [x] With seeded weeks for Finn and Tess, "days met" and the gaps list match hand-computed results from the rules. *The seed week for each persona is a fixed list of meals with round-number vectors (`apps/api/src/db/seed-weeks.ts`, worked out by hand in its header comment). Finn: 6 logged days, 4 met, streak 4, gaps vegetables, fibre, fruit, vitamin D, vitamin A, water in that order. Tess: 6 logged, 3 met, streak 2, gaps protein, fruit, added sugar, iron, folate, vitamin A, water. An independent script of plain sums and the thresholds gave the same answers before `stats.test.ts` pinned them (per-day statuses, day counts, average ratios and evidence strings).*
- [x] Today renders correctly at 360, 390 and 430 px wide, in dark and light, with no horizontal scroll. *Walked in a headless iPhone 13 profile at 390x844 dark, 360x780 light and 430x932 dark; `scrollWidth <= innerWidth` on Today, Week and History at every width; screenshots reviewed by eye.*
- [x] Week screen first paint under one second on a throttled "Fast 3G" profile with a warm cache. *Production build served by the API, Chrome's Fast 3G profile via CDP (1.6 Mbps down, 562 ms RTT). Tapping the Week tab with a warm query cache: strip visible in 48 ms. A full reload of /week with a warm service worker cache: first contentful paint 680 ms, skeleton at 0.9 s, strip with data at 1.7 s. The router guard now fetches the session and the profile in parallel; before that the same reload painted at 1.3 s. Week payload 24.6 KB uncompressed.*
- [x] The AI weekly review references real numbers from the week and respects the user's diet pattern in suggestions. *Generated live with `gpt-5.5` for both personas (`pnpm ai:smoke:week`, about 4.3 s, 1,950 input / 300 output tokens). Finn's review quoted "4 of 6 days met", "2.5 of 6 serves" and "25.5 / 45 g" and took the top two gaps as its two changes; Tess's took protein and fruit, suggested Greek yoghurt, eggs and chicken (omnivore) and never mentioned shellfish. Both ran about 195 words against a 170-word instruction. "Respects the diet pattern" is enforced by the prompt and by pre-filtering the suggestion lists; it is not checked mechanically.*
- [x] Tapping any day in the strip or calendar opens that day's log. *Both push `/day/YYYY-MM-DD`, which is the Today screen opened on that day; verified for a strip day and a calendar day in the walk.*

**Deferrals.** No real-phone check yet (headless only). The review is generated on demand only for the current seven-day window; past windows show their cached review if one exists and never regenerate. Water is scored against the training-day target every day (the rest-day figure is shown on Targets only). Light-mode contrast of the macro bar colours and the met and close status colours is below 3:1 on white by the dataviz validator; every bar and dot carries a text label, which is the accepted relief, but darker light-mode variants would be better (mobile-ui tokens).

**Decisions it depends on.** D7, D8. Settled the cron-vs-on-demand question as D17 (on demand, cached per ISO week) and surfaced D18 (water quick-adds are log entries).

---

## Slice 5 - Progress, settings and publish-readiness

**Status:** done with deferrals (2026-09-26)

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
- [ ] A week of daily use by the owner and one friend with no visible bugs reported. *Deferred: needs the owner and a friend on real phones for a week. Everything below was walked in a headless phone viewport (390x844 dark, 360 light, 430 dark) against the production build served by the API, 49 checks passing, plus 235 automated tests.*
- [x] Export downloads a file containing every log entry; delete account removes every row for that user. *JSON export for Tess held 53 log entries, 8 weigh-ins and 2 target versions, served as `diet-tracker-2026-09-26.json` with a download header; the food-log CSV had one row per entry with every nutrient as a column. `account.test.ts` compares the exported ids with the table. Delete account was walked with a throwaway account (two confirmations, back to login, session gone, sign-in refused) and the API test checks users, sessions, profiles, target_versions, weight_entries, foods, log_entries and daily_summaries are all empty afterwards.*
- [x] Lighthouse PWA and accessibility at or above 90 on the deployed URL. *Run against the production build locally (the Railway URL is the owner's to deploy). Lighthouse 13 no longer has a PWA category (removed in v12), so installability was checked by hand: manifest with 12 icons and maskable variants, service worker registered, standalone display. Accessibility 100 on Login, Today, Progress, Settings and Week after fixing light-mode contrast, the auth pages' main landmark, two button-name mismatches and a nested definition list. Best practices 100 (Login 96: the expected 401 from the session check when signed out). SEO 100. Performance 70 to 84 under Lighthouse's simulated slow 4G with 4x CPU throttle (first paint about 3.7 s there); not a Done-when number, recorded for honesty.*
- [x] Airplane mode: Today still shows the last known state and a quick-add queues and sends when back online. *Production build with the service worker: after one online visit, `setOffline(true)` and a reload showed the last known Today from the localStorage mirror with the offline banner; a +250 ml glass and a My foods entry were queued, counted in the bars and listed as "waiting for a connection"; on reconnect the toast said "Sent 2 queued entries" and both were on the server. The AI "Describe" path stays disabled offline by design.*
- [x] Recalibration proposes a sensible change for a seeded user whose weight stalled for two weeks. *Tess (gentle loss, flat trend at 50 kg over 14 days, 12 logged days averaging 1680 kcal): the proposal is 1570 to 1380 kcal (275 by the formula, bounded to 200, then the 25% deficit clamp), protein unchanged at 100 g, carbs 190 to 155 g, with the clamp note shown. Applying wrote a `recalibration` target version visible in history with "minus 186 kcal from recalibration" in the energy reason; a later profile edit kept it. Finn gaining about 0.3 kg a week against a 0.25 plan reads "on track". Pinned in `recalibration.test.ts` (shared) and `progress.test.ts` (API).*

**Deferrals.** The week of real use. Reminders are in-app timers only (a web app cannot wake itself; D22 explains, the settings card says so; native local notifications come with the shell). "Forgot my password" is not built (needs the email-provider decision; change password is). `LEGAL_CONTACT_EMAIL` is empty until the owner fills it. The Capacitor projects are scaffolded, not built (Android needs Android Studio, iOS a Mac), and D23 on what the shell loads is the owner's call. Performance under Lighthouse's throttled profile is in the 70s; the app-shell JavaScript is about 500 KB uncompressed and would need code-splitting work to move that.

**Follow-ups shipped (2026-09-26), from the owner's first use.** A logged estimate that was not saved at the time can be saved to My foods from its entry sheet. The energy ring says "kcal over" once intake passes the target, even while the status is still "close". Food-group rows and vitamin, mineral and limit tiles on Today open a panel with the day's sources, largest first, and food ideas when short or over. Walked in a 390x844 dark, 360-wide light and 430-wide dark headless browser (56 checks), with axe-core showing no violations on the new panels in either theme; 247 automated tests. See CHANGELOG.

**Decisions it depends on.** Surfaced D19 (weigh-ins and the profile weight), D20 (recalibration as an engine input), D21 (offline mirror and queue), D22 (reminders), D23 (native shell loading, proposed) and D24 (export formats); D19 to D22 and D24 confirmed by the owner on 2026-09-26. D23, the domain, the email provider and the deferrals above are parked in `docs/OUTSTANDING.md` until after the first week of real use.

---

## Ideas after slice 5 (not planned)

- Coach chat: a conversational agent with tools to log food, answer "how am I doing", and propose target changes.
- Photo-of-meal estimation via the vision model.
- Barcode scanning with Open Food Facts lookup.
- USDA FoodData Central as a second resolver for whole foods (D5 option B).
- Recipes: build a meal from foods and log it as one item.
- Sharing a week summary with a friend or coach.
- Apple Health / Google Fit weight sync via Capacitor.
