# Development plan

The app was planned as five slices. Each slice is one working session, produces something the owner can open on their phone, and ends with a commit on `main`. Slices are started only when the owner asks ("do slice 2"). The `slice` skill carries the working loop. All five were done by 2026-09-26; slice 6 (Meals) was added on the owner's request on 2026-10-01, and on 2026-10-12 the app was split into a food half and a gym half (D38). What remains is real-phone use, the open decisions in `docs/DECISIONS.md`, and the ideas at the bottom.

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

## Slice 6 - Meals

**Status:** done with deferrals (2026-10-01)

**Goal.** A meal someone eats every day is logged in a few taps, not rebuilt ingredient by ingredient each time.

**In scope.**
- Saved meals: a name and 1 to 20 ingredients for one portion. An ingredient is a food from My foods with an amount, or one typed in by hand (saved to My foods by default).
- A Meals tab (the bar becomes Today, Meals, Log, Week, You) to list, search, create, edit and delete them, and a meal editor screen.
- A Meals tab in the Log food sheet: pick a meal, choose portions, optionally change or leave out an ingredient for that time, pick the meal of the day and the day, confirm. No typing, no AI call.
- Pure portion math in `packages/shared` (`scalePortion`, `savedMealEntries`, `savedMealTotals`) with worked examples; `saved_meals` and `saved_meal_items` tables; `/api/v1/meals`; meals in the export, the account deletion cascade, the offline mirror and the seed.

**Out of scope.** Building a meal by describing it to the AI; turning a meal already in the day log into a saved meal; grouping a logged meal's entries under one header; sharing meals between people.

**Done when.**
- [x] Build a meal from saved foods and a typed ingredient; the Meals page shows it with the right total. *Walked in a headless phone viewport at 390x844 dark, 360x780 light and 430x932 dark: "Yoghurt bowl" from 50 g Rolled oats (190 kcal), one Banana (105) and 15 g of typed-in Honey (45.6) shows 341 kcal and 3 ingredients in the editor and on the Meals page; the honey was saved to My foods. An empty name and an empty ingredient list are refused inline.*
- [x] Log it from the + sheet with no typing and no AI call; Today rises by exactly the meal's totals. *Four taps (+, Meals, the meal, Add): the day's energy rose by 340.6 kcal and three entries appeared. `saved-meals.test.ts` asserts no `ai_calls` row is written and that the summary equals `savedMealTotals`.*
- [x] Log half a portion, or with one ingredient left out, without changing the saved meal. *Half a portion with the banana removed added 117.8 kcal ((190 + 45.6) / 2) and the saved meal still had its three ingredients at their saved amounts.*
- [x] Rename, edit and delete a meal; past log entries keep their numbers. *Renamed, oats to 60 g, honey removed: the list read 333 kcal and 2 ingredients, and the day's entry count and energy were unchanged. The same after deleting the meal.*
- [x] Deleting a food that a meal uses leaves the meal intact. *Deleted Rolled oats from My foods: the meal kept its total and the ingredient, now marked "Entered by hand". Editing a food's numbers also leaves meals as they were (API test).*
- [x] Offline: the Meals list still shows and a meal logged offline is queued and sent later. *Production build with the service worker: offline cold start listed the meals from the mirror; logging one queued three entries shown on Today as "waiting for a connection" and already counted; on reconnect "Sent 1 queued entry", three rows on the server and the meal marked as used. Saving a meal offline is disabled and labelled.*
- [x] Export includes meals; delete account removes them. *`account.test.ts`: `savedMeals` in the JSON export (schema 2) and both tables empty after deletion.*
- [x] Typecheck, lint and tests green; the migration runs from a fresh database and from the previous state. *288 tests (146 shared, 31 web, 111 API) on the head of `main`, in a clean checkout against its own Postgres. Migration 0006 applied to a fresh database and to a seeded database at 0005; a second run applied nothing.*

**Follow-ups shipped (2026-10-01), on the owner's review.** Meals moved from a row under You to its own tab, and search by name or ingredient was added to the Meals tab and the Log food sheet. Walked at 390 dark, 360 light and 430 dark (21 checks each: five equal tabs with the + centred, the tab lit on the list and the editor, no Back on the list, search by name, by ingredient, no match and clear, the same in the sheet), with the 40-check meals walk rerun; 35 web tests.

**Deferrals.** No real-phone check (headless only, 135 checks across the three widths plus the offline, empty and error states). An ingredient cannot be renamed once added. Correcting a food does not update meals that already use it (D28). The light-mode macro letters on the ingredient rows share the known contrast issue from slice 4.

**Decisions it depends on.** D5, D15, D21. Surfaced D28 (ingredients are snapshots) and D29 (one log entry per ingredient), both accepted by the owner on 2026-10-01.

---

## Slice 7 - Add to meals from a described meal

**Status:** done (2026-10-07)

**Goal.** The first time someone describes a meal with several parts ("4 eggs and two slices of toast with butter"), they can keep it as a saved meal in the same tap, so the second time is four taps and no AI call.

**In scope.**
- An "Add to meals" tickbox on the AI review card, shown only when two or more items remain after edits and removals. Ticking it reveals a name field pre-filled from what was typed with the lead-in dropped ("I had 4 eggs and toast" suggests "4 eggs and toast"); an empty name is refused inline.
- The meal is created in the same request and transaction as the entries (`saveAsMeal: { name }` on `POST /api/v1/log/entries`, D32): one portion is exactly what was logged, items saved to My foods in that request become linked ingredients, and the meal counts as used so it tops the Meals list. The response returns it as `savedMeal`.
- Offline, the queued request carries the flag, so the meal appears once the queue is sent.

**Out of scope.** Turning a meal already in the day log into a saved meal; a tickbox on the manual entry form or the My foods path (one item is a food, not a meal); grouping the logged entries under one header (D29 option C).

**Done when.**
- [x] Describing a meal with several items shows the tickbox; one item does not. *Walked against the production build at 390x844 dark, 360x780 light and 430x932 dark with the live model: "I had 4 eggs and two slices of toast with butter" came back as three items (eggs, toast, butter) and the tickbox appeared under the meal and day pickers; "I had a banana" came back as one item with no tickbox; removing the three-item estimate down to one item made the tickbox disappear.*
- [x] Ticking it, naming it and confirming logs the entries and creates the meal in one go. *The confirm request carried `saveAsMeal`, answered 201 with a three-ingredient `savedMeal` and `lastUsedAt` set; the toast read "Added to snack · 550 kcal · saved as "Eggs on toast""; the Meals tab listed it as "550 kcal · 3 ingredients · logged 7 Oct, 16:30" and the + sheet's Meals tab offered it. No horizontal scroll at any width. `log.test.ts` pins the shape: items in order, the toast linked to the food saved by `saveToLibrary`, the eggs unlinked, the meal first in the list, nothing saved without the flag.*
- [x] A blank name is refused and nothing is logged. *Inline "Give the meal a name" under the field in the browser; on the API a whitespace name is a 400 and leaves `log_entries`, `foods` and `saved_meals` empty (the meal is created inside the entries transaction).*
- [x] The suggested name drops the lead-in. *`meal-name.test.ts`: "I had 4 eggs and two slices of toast" to "4 eggs and two slices of toast", "for breakfast I had porridge and a coffee" to "Porridge and a coffee", long text cut at a word under 80 characters.*

**Deferrals.** No real-phone check (headless only). The offline case (queue carries the flag, Meals refreshes on flush) is covered by the existing queue code paths and was not walked with the service worker this session. Hitting the 100-meal cap while confirming fails the whole log with the cap message rather than logging without the meal.

**Decisions it depends on.** D28, D29. Surfaced D32 (the meal is created in the entries request).

---

## Slice 8 - Gym logging: exercises, sessions, the Today card

**Status:** done with deferrals (2026-10-08)

**Goal.** Log a gym session on the phone, at the gym, with bad signal: pick exercises, enter sets as weight and reps, see what you did last time for each exercise, finish, and see the session on Today beside the food. This is the first of three training slices (D35); progress charts and the nutrition crossover come next.

**In scope.**
- Four new tables (`exercises`, `workouts`, `workout_exercises`, `workout_sets`) in `apps/api/src/db/schema/training.ts`, one migration, and a shared exercise catalogue of common lifts with a null user id (D35). Custom exercises per user.
- Shared: enums (exercise kind, muscle group, measure), zod schemas for the catalogue, a workout document and its wire shapes, and the first pure training functions (volume, working sets, duration) with tests. `docs/TRAINING-MATHS.md` starts, with the same update rule as the nutrition page.
- API: `GET/POST/PATCH/DELETE /api/v1/exercises`, `GET /api/v1/exercises/:id/history` (recent sets for one exercise, for the "last time" numbers), `GET /api/v1/workouts?from&to`, `GET/PUT/DELETE /api/v1/workouts/:id`. A workout is one document, upserted by its client-generated UUID v7 (D35), written in one transaction. Workouts are exempt from the dated purge (D36) and included in the account export.
- Web: a Workout card on Today (that day's sessions with duration, sets and volume, or "Rest day" with "Log a workout"); the session screen at `/workouts/:id` (title, exercise blocks, set rows with weight and reps steppers, a done toggle (the warm-up toggle was removed on 2026-10-30), "last time" under each exercise, add set copies the last set, finish); an exercise picker sheet with search, recent first and "add your own"; `/workouts/new` offers "repeat a recent session"; a Workouts list under You. The draft lives in local storage and autosaves with a debounced PUT, so a session survives a dead signal and a closed tab.

**Out of scope.** Per-exercise charts, PRs and estimated one-rep max (slice 9). Training days feeding water, protein, the weekly review or recalibration (slice 10). AI "describe your workout". Templates, supersets, rest timers, a Workout tab. Cardio distance is stored but has no UI yet. Apple Health workouts.

**Done when.**
- [x] From Today, "Log a workout" opens a new session; picking "Barbell back squat" from the catalogue and entering three sets saves without touching a Save button, and the session shows on Today with its duration, sets and volume after Finish. *Walked with Playwright at 390x844 dark (full flow), 360x780 light and 430x932 dark against Vite and the API: the card read "Rest day so far", the session was created from the start screen, the squat picked from the catalogue search, three sets entered (100×5, 100×5, 102.5×3) and ticked; the header went "Saving…" then "Saved" and `GET /workouts` returned the three sets. After Finish the card showed "Finished · 3 sets · 1,308 kg" and Today read "Push A · 0 min · 3 sets · 1,308 kg".*
- [x] Opening the same exercise in a later session shows last time's sets greyed in each row, and "Add set" copies the last set entered. *The repeated session showed "Last time 8 Oct · 3 sets" under the exercise and "100 kg × 5" in row 1's Last column (a button that fills the row); "Add set" after a 100×5 set produced a 100×5 row, not done.*
- [x] Airplane mode mid-session: the sets keep going in, the header says "Saved on this phone", and the session reaches the server on reconnect. *`context.setOffline(true)`, a fourth set (105×1) added and ticked, header "Saved on this phone", the draft in localStorage marked dirty; back online the header returned to "Saved" and the server copy had four sets.*
- [x] "Repeat" on a past session starts a new one with the same exercises and sets, none ticked done. *From New workout, "Push A" started a session with the squat and its three sets, all with "Mark set n done" buttons (none done). `stats.test.ts` pins the copy rules.*
- [x] A custom exercise can be added from the picker and appears in later searches; deleting it leaves past sessions showing its name. *"Pistol squat" (bodyweight, reps only) added from the picker's form became a reps-only block; searching "pistol" listed it with a "Yours" badge; after `DELETE /exercises/:id` and a reload the block still read "Pistol squat" with its set, `exerciseId` null on the server, and its rows kept reps-only because measures are inferred from the sets when the exercise is gone.*
- [x] A workout older than six months survives the purge; the export JSON lists workouts and custom exercises; deleting the account removes all four tables' rows. *`training.test.ts`: `purgeExpiredData` leaves a 213-day-old session; `/account/export/json` (schema 3) carries `workouts` and `exercises`; `DELETE FROM users` empties the four tables and leaves the 74 catalogue rows.*
- [x] Looks right at 360, 390 and 430 wide, dark and light; the keyboard never hides the row being edited. *No horizontal scroll on Today, the start screen, the session, the picker and the list at all three widths; the set row was tightened after the first pass clipped "102.5" at 360. The keyboard check is headless only: inputs are plain text fields in normal flow (no sticky footer over them), so the browser scrolls the focused row into view; the Finish button is below the rows, not pinned.*

**Deferrals.** No real-phone check (headless only); the keyboard-over-row check in particular wants a real iPhone. Blocks cannot be reordered; a set can only be removed from the end of a block ("Remove last set"); RPE is stored but has no input yet; cardio distance and time have plain number inputs (seconds, metres) rather than a mm:ss or km field. The seed does not create sessions for Finn or Tess. Pending drafts of a session created offline are listed on Today and under Workouts but a never-synced draft cannot be opened from another device until it syncs (by design).

**Decisions it depends on.** D35 (data model, session document, placement), D36 (retention).

---

## Follow-up - Preferences: water, workouts, nutrient detail

**Status:** done (2026-10-08)

**Goal.** Let a person switch off the parts of the app that get in the way: water tracking, the gym features, and the full nutrient suite (keeping energy, protein, carbs, fat and fibre). All on by default; nothing recomputed, nothing deleted (D37).

**Shipped.** `profiles.preferences` (migration 0011), `PATCH /api/v1/profile/preferences`, `preferences` on the profile wire shape, `isTargetShown` / `shownTargetKeys` / `filterGaps` in `packages/shared/src/preferences.ts`. Settings has a Preferences row (its subtitle says what is off) leading to `/settings/preferences`: a water toggle, a workouts toggle and an Everything / Macros only control, each saving on change. Today hides the water card, the Training card, the vitamins grid and the food groups accordingly; Week hides the water and sodium rows and swaps the Nutrients tile for a Protein tile in macros mode; Targets hides Hydration, Limits, Vitamins and Food groups; You hides Workouts; the entry editor offers only fibre under "More nutrients" and the manual food form drops its vitamins and food-group disclosures. Week stats (and so the weekly review's prompt) drop gaps about hidden things.

**Done when.**
- [x] Settings > Preferences shows three controls, all on for a fresh account, and each change persists across a reload and on the server. *Walked at 390x844 dark with Playwright against Vite and the API as Finn: the row reads "Water, workouts, nutrient detail"; after turning everything off and reloading, "water off · workouts off · macros only"; `GET /profile` returned the saved values; `profile.test.ts` pins the defaults, the patch, the validation and that a full profile save leaves them alone.*
- [x] Water off: no water card on Today, no Hydration on Targets, no water row or water gap on Week. *All three checked by heading and text; the Training card stayed.*
- [x] Workouts off: no Training card on Today and no Workouts row under You. *Checked; `/workouts` stays reachable by URL on purpose.*
- [x] Macros only: Today shows the energy card and the log only; the entry editor's "More nutrients" holds fibre alone; the food form has no vitamins or food-group disclosures; Week shows the Protein tile, energy / protein / carbs / fat / fibre rows and only the fibre gap; Targets shows Macros alone. *Checked; `stats.test.ts` pins that Finn's seeded week keeps its two met days and loses the vitamin, food-group and water gaps while the scores stay.*
- [x] Everything back on restores every card with the same numbers. *Checked on Today; the server returned the defaults.*
- [x] Looks right at 360, 390 and 430 wide, dark and light; no horizontal scroll. *Preferences and Today (macros mode) at all three widths.*

**Deferrals.** No real-phone check. The `/workouts` routes and the water quick-add API stay reachable when switched off (a bookmark still works). The weekly review was not regenerated against the real model with preferences off; the prompt builder is covered by its existing unit tests and the gap list it quotes is filtered server-side.

**Decisions it depends on.** D37.

---

## Follow-up - Two halves: Food and Gym (D38)

**Status:** done with deferrals (2026-10-12)

**Goal.** Split the app into a food half and a gym half that share one account and the You tab but nothing else on screen. A Food / Gym switch in the middle of the header on every root screen flips between them; each half has its own five tabs (Today, Meals or Workouts, Log, Week, You). Food's Today no longer shows training; the gym gets its own Today, Week and a per-lift trend. The two connect later through insights (slice 10); for now the ask is an easy logging system and a way to see gym progress.

**Shipped.** `ui.mode` (`dt.mode` in localStorage) with `useAppMode` reading it through the workouts preference; `ModeToggle` centred in `AppShell`'s header on root screens (the header is a three-column grid; the Today and Week day steppers moved from the header into the body as `DayStepper` so the switch fits at 360 wide); `TabBar` with a layout per half (the Log button starts a session in the gym half); routes `/gym`, `/gym/day/:day`, `/gym/week`, `/gym/lifts`, `/gym/lifts/:id` plus the existing `/workouts*`, all `meta.mode = 'training'`, mirrored by the food routes with `meta.mode = 'diet'`; the router sets the mode as a half's screen opens, sends gym routes to Today while workouts are off, and reopens `/` in the gym when that is where the person left off. Gym Today: the day's sessions, "Log a workout", four recent sessions to repeat in one tap, the offline line. Gym Week: sessions against the profile's training days, sets, kg lifted and time, a seven-day strip of trained days, the week's sessions by day, and Lifts. Lifts: every exercise used, most recent first; a lift shows its best and latest set, the best set per session on a line (last 20 sessions) and each session's top set. The Training card left food's Today; Workouts left You (it is a tab) and the start screen offers "Continue" for a session still open today. Shared: `summariseWorkouts` and `bestSet` with tests, written up in `docs/TRAINING-MATHS.md`.

**Done when.**
- [x] Food's Today has no Training card and food's tabs are Today, Meals, Log, Week, You; the Food / Gym switch sits centred in the header. *Walked with Playwright at 390x844 dark, 360x780 light and 430x932 dark against Vite and the API as Finn: no "Training" heading, the tab labels as listed, the switch's centre within 0 px of the viewport centre on Today, Week and Workouts at every width, no title clipped.*
- [x] Tapping Gym from Today lands on the gym's Today with tabs Today, Workouts, Log, Week, You; tapping Food from You stays on You and swaps the tabs. *Checked at all three widths.*
- [x] Gym Today shows the day's sessions and repeats a recent one in a tap; after Finish the day reads its sessions, sets and kg. *Four seeded sessions; "Repeat a recent session" listed Legs A and Legs B; the repeat opened a session with the squat and its sets, two ticked and finished; gym Today then read "1 session · 2 sets · 1,025 kg" with the Legs A row.*
- [x] Gym Week shows sessions / planned, sets, kg lifted, a strip with a dot per trained day and the week's sessions by day. *Tiles read "4 / 6 planned", "11, 4 days trained", "4,948 kg, 2 h 24 min"; four trained days dotted; sessions grouped under Today, Yesterday and dates.*
- [x] Lifts lists the exercises used and a lift shows best, latest, a trend line and its sessions. *Barbell back squat: best 105 kg (11 Oct), latest 105 kg (12 Oct), a five-point line, five session rows with their top set.*
- [x] The Log button starts a session in the gym half; a session left open today shows as "Continue" on the start screen. *Checked.*
- [x] The bookmark (`/`) reopens in the gym after the gym was used last. *After switching to Gym on Week, a load of `/` landed on `/gym`.*
- [x] Workouts off in Preferences hides the switch, shows food's tabs and sends `/gym` to Today. *Checked.*
- [x] Looks right at 360, 390 and 430 wide, dark and light; no horizontal scroll; no console errors. *All three widths, every screen above.*

**Deferrals.** No real-phone check (headless only). The day stepper moving into the body costs 44 px of vertical space on Today and Week, both halves; worth judging on a phone. The lift trend plots the last 20 sessions only (`MAX_EXERCISE_HISTORY`; a chosen range of up to a year since 2026-11-03) and knows no personal records or estimated one-rep max (slice 9). The gym half has no history calendar and no AI review. The Food / Gym labels are a first guess at the words.

**Decisions it depends on.** D38 (the split itself, the switch's placement and what is shared), D35, D37.

---

## Follow-up - Last / Best on a session, and what "best" means (D39)

**Status:** done (2026-10-19)

**Goal.** A Last / Best switch on the session screen (once, not per exercise) that turns the "last time" column into "your best for that set"; "best" meaning the most weight lifted in one set (weight × reps) by default, with a Preferences setting for the heaviest weight; and the gym Week's week-on-week card ranking and labelling lifts the same way, so 30 kg × 15 after 35 kg × 10 reads as a gain of 100 kg, not a drop of 5 kg.

**Shipped.** Shared: `BEST_BASES` / `bestBy` on the preferences, `bestSetBy` (one ranking with tie-breaks), `bestSetAt`, `liftMetric`, `primaryMeasure`, `setMetricValue`, `compareWeeks({ basis })` with `metric` on every lift. Web: `PillToggle` (also behind `ModeToggle`), `AppShell`'s `header-centre` slot for pushed screens, `ui.setReference` remembered on the device, the session screen's pill, `ExerciseBlock` fetching 20 sessions and choosing the reference per position, `SetRow` taking any reference, the Week card and screen passing the basis and labelling in the metric ("450 kg (30 kg × 15)", "+100 kg"), the lift page's tiles and chart on the same basis, a Best set card under Preferences and the Settings row's summary. Written up in `docs/TRAINING-MATHS.md` and D39.

**Done when.**
- [x] A session shows a Last / Best pill in its header; Last shows last time's set at each position, Best the best at each position over past sessions by weight × reps; tapping either copies it in; the choice survives a reload. *Walked with Playwright at 390x844 dark, 360x780 light and 430x932 dark against Vite (:5174) and the API as Finn, with three seeded bench sessions (35×10/35×10/35×8, 35×10/37.5×8/35×8, 30×15/30×12/30×10): Last read "30 kg × 15 / 30 kg × 12 / 30 kg × 10" with "Last time 17 Oct · 3 sets"; Best read the same three (450, 360 and 300 kg beat 350, 350 and 280) with "Best of your last 3 sessions · weight × reps"; tapping set 1's Best filled 30 and 15; Best was still selected after a reload.*
- [x] Settings > Preferences > Best set switched to Heaviest weight changes the Best column, the Week card and the Settings row. *Best then read "35 kg × 10 / 37.5 kg × 8 / 35 kg × 8" with "· heaviest"; the Week card showed bench "30 kg × 15, from 37.5 kg × 8" with "−7.5 kg" and the squat as the biggest gain at "+5 kg"; the Settings row read "best by weight".*
- [x] Gym Week by default leads with bench "+100 kg". *"Biggest gain: Barbell bench press, 450 kg (30 kg × 15), from 350 kg (35 kg × 10) last week, +100 kg"; squat "525 kg (105 kg × 5), from 500 kg (100 kg × 5), +25 kg".*
- [x] The lift page follows the preference. *Best tile "450 kg" with "30 kg × 15 · 17 Oct" and the note "kg lifted in one set, weight × reps" under the chart heading.*
- [x] Header: the pill is centred and the title is not clipped at 360, 390 and 430; the save status keeps its icon everywhere and its words from 400 px. *Pill centre offset 0 px at 390 and 430, 8 px right of centre at 360 (the title keeps its words and the pill nudges); "Workout" unclipped at all three; status 14 px wide (icon) at 360 and 390, "Saved" at 430.*
- [x] No horizontal scroll, no console errors, at all three widths, dark and light. *Checked on the session (Last and Best), Preferences, Week and the lift page.*
- [x] Tests: `stats.test.ts` (ranking, tie-breaks, best at a position, the metric rule), `insights.test.ts` (both bases, a weight-only exercise), `preferences.test.ts`, `draft.test.ts` (labels), `profile.test.ts` (the patch and its validation against Postgres).

**Deferrals.** No real-phone check (headless only). Best at a position lines up by raw position, so a light first set logged one week and not the next shifts the comparison by one row (the same holds for Last). The warm-up toggle was removed on 2026-10-30: every ticked set counts. The exercise picker and the Workouts list do not say which basis is in force; the lift page and the Week card do. Estimated one-rep max as a third basis waits for slice 9.

**Decisions it depends on.** D39, D37, D38.

---

## Follow-up - Uncapped energy (D40)

**Status:** done (2026-10-31)

**Goal.** Let a person say the energy target is a floor: going over never scores "over" and never costs the day. Offered where the target is set (the energy sheet under Targets), on the Profile form, and during onboarding for a gain goal.

**Shipped.** Shared: `energyUncapped` on the profile and on `TargetInput`, an `uncapped` mark on the energy `TargetEntry` (absent when off, so older versions compare equal), `scoreTarget` treating an uncapped goal as a floor, `dayMetRule(goal, energyUncapped)` and `energyUncapped(targets)`, `findGaps` skipping "energy over plan" for it. API: `profiles.energy_uncapped` (migration 0013), `PUT /profile` keeps the stored value when the field is left out, `PATCH /targets/overrides` takes `energyUncapped` and flips the profile and the current version in place, the weekly review's day-met sentence. Web: the Uncapped switch in the energy sheet, "Set by you · Uncapped" on the card, "Energy reached, protein hit." on Today, the switch on the Profile form, and on onboarding's pace step for a gain goal with ", uncapped" on the review row. Written up in `docs/NUTRITION-MATHS.md` 1.12 and D40.

**Done when.**
- [x] A 3,000 kcal target with 4,200 kcal eaten reads Met, the ring says "1,200 kcal over", and the day is met with "Energy reached, protein hit."; the same day capped reads Over and "Not met yet · energy over". *Walked with Playwright at 390x844 dark and 360x780 light against Vite (:5174) and the API, with two 2,100 kcal entries posted through the API.*
- [x] The energy sheet shows the Uncapped switch; flipping it alone enables Save, saves with a toast ("Energy capped again" / "Energy uncapped: going over never costs the day"), and the card's "Uncapped" word follows it; a value and the switch save together as "Set by you · Uncapped". *Walked at both widths; `GET /profile` followed the switch each time.*
- [x] The Profile form shows the switch in its state and saving the form untouched keeps the flag, the pin and the version. *Walked; the version id was unchanged.*
- [x] Onboarding: the pace step shows "Uncapped energy" for a gain goal, off to start; the review row reads "Gain muscle, lean gain, uncapped"; Create my plan lands on Targets with "Uncapped" on the energy card and the flag on the profile; going back and choosing Lose fat hides the switch. *Walked at 430x932 dark and 360x780 light.*
- [x] No horizontal scroll and no console errors on every screen above, both themes.
- [x] Tests: `scoring.test.ts` (the floor band, day met over and under, the summaries), `targets.test.ts` (the mark, the reason, a pin, false equals absent), `gaps.test.ts` (over plan skipped, under plan kept), `profile.test.ts` (onboarding with the flag, an absent field keeps the stored value, the overrides patch in place, the flag across a profile change, a non-boolean rejected).

**Deferrals.** No real-phone check. The first read of the Targets screen in the walk's cold 390-dark run came back before the card had rendered (the screenshot of that state shows "Uncapped"); the later reads and the 360 run passed the same checks. The weekly review was not regenerated against the real model; its prompt builder is unit-tested. The Week screen's energy chart has no upper line to drop, so it is unchanged.

**Decisions it depends on.** D40, D34, D31.

---

## Slice 11 - The coach (D41)

**Status:** 11a, 11b and 11c done (2026-11-02); live-model checks run 2026-11-03 with a working key (the smoke table below, the briefs for Finn and Tess, the weekly review, and a phone walk of the brief, a streamed answer and every card against gpt-5.5)

**Goal.** One AI coach that knows everything the app knows about a person and helps them think about it: "how am I doing", "what should I eat tonight", "am I getting stronger on squat", "should I change my target". It reads through typed tools over the existing services, speaks in plain words with the real numbers, and drafts actions as cards the person confirms. It lives at `/coach`, shared by both halves, behind the same AI consent as the estimator. Mechanics in the `ai-coach` skill; choices in D41.

**Why in three parts.** Each part is one session and ends with something to use on a phone. The first is the whole value for questions; the second makes the answers actionable; the third brings the coach to the person instead of waiting to be asked.

### 11a - Ask the coach (read-only, streaming)

**In scope.**
- `packages/shared/src/coach/`: thread and message wire schemas, the card schemas (empty union for now, filled in 11b), tool argument schemas, the SSE event schema.
- DB: `coach_threads`, `coach_messages` (migration 0014), retention by `updated_at` (D27), both in the export (D24), cascade delete.
- API: `apps/api/src/ai/coach/` with the briefing builder, the system prompt, the tool loop, the read tools (`get_day_food`, `get_week_food`, `get_month_food`, `get_targets`, `get_gym_week`, `get_workout`, `get_lift_history`, `get_weight_history`, `get_recalibration`, `search_my_foods`, `search_meals`, `list_exercises`, `get_weekly_review`), the threads service and routes: `GET /coach/threads`, `POST /coach/threads`, `GET /coach/threads/:id`, `POST /coach/threads/:id/messages` (SSE, `?stream=false` for JSON), `DELETE /coach/threads/:id`. Purpose `coach` in `AI_PURPOSES`; env `OPENAI_COACH_MODEL` (defaults to `OPENAI_MODEL`) and `AI_COACH_DAILY_TURN_CAP` (60) in `.env.example` and the zod env.
- Web: `apps/web/src/features/coach/`: the sparkles button in the header's right column on root screens (both halves), `/coach` (latest thread, or an empty state with three suggestion chips), `/coach/threads` (recent chats, New chat, swipe or button to delete), the message list with streamed text and status lines, the composer pinned above the keyboard, the consent card first (copy extended: the coach also sends the food log for the days it looks at, workouts and weigh-ins), offline state (composer disabled, "The coach needs a connection"), error state with retry, a Coach row under You.
- Tests: briefing against Finn and Tess; every tool against Postgres including the cross-user scoping check; the loop with a scripted fake client; routes. Smoke `pnpm ai:smoke:coach` with the ten canonical questions.

**Out of scope.** Draft cards and writes of any kind, notes, proactive briefs, web search, photo input, voice.

**Done when.**
- [x] From Today (either half) the sparkles button opens `/coach`; a fresh account sees the consent card, then an empty state with suggestion chips; the first message creates a thread and the answer streams in word by word within about two seconds of the first token. *Walked at 390x844 dark: sparkles on Today, consent card with the coach's extra sentence, three chips, the first send created the thread and the URL became `/coach/<id>`. The streamed answer itself could not be seen in the browser: the OpenAI key in `apps/api/.env` (and the one the shell exports) is rejected with 401, so every turn showed the failure copy with Try again. The event order (status, deltas, done) is covered by the route test with a scripted model.* *2026-11-03, live: walked at 390x844 dark against gpt-5.5 with a fresh account; the first text of the answer appeared 1.5 s after Send and grew in 13 steps over 5.5 s, no failure copy, no console errors.*
- [x] As Finn: "How am I doing this week?" answers from the briefing with no tool call, quotes the days met, energy and protein averages exactly as the Week screen shows them, and names the top gap the Week screen lists. *The briefing test checks the days logged and met, the streak, the whole-number energy and protein averages (`summariseTarget`, as the Week rows round) and every gap's evidence line. The model's answer is pending the key (smoke below).*
- [x] "Am I getting stronger on squat?" shows a status line naming the lift history tool, then an answer whose numbers match the lift page (best, latest, trend). *The tool test checks best 525 kg lifted (105 kg × 5), latest the same and +25 kg (5%) over three sessions, which is what the lift page showed in the walk; the loop test checks the status line "Looking at your last 5 squat sessions" is emitted before the deltas and kept in the trail. The model's wording is pending the key.*
- [x] "What did I eat on <a day with no entries>?" says there is nothing logged that day; "What did I eat yesterday?" lists the entries by meal with the kcal the Today screen shows. *`get_day_food` returns `{ empty: true, reason: "nothing logged on <day> (...)" }` for an empty day and a future day, and yesterday's entries by meal with whole kcal, tested. The model's answers are pending the key.*
- [x] A turn over the daily turn cap gets the friendly cap message; a 1,001-character message is rejected before any call; a thread at 40 turns offers New chat. *Route tests: 429 `ai_cap_reached` with the "daily limit" copy at the cap, 400 for 1,001 characters with no `coach_messages` or `ai_calls` row, 409 "Start a new chat" at 40 turns; the composer swaps for a New chat button at 40 turns and the textarea caps at 1,000 characters.*
- [x] Threads list, reopen with history, and delete; a deleted account leaves no `coach_*` rows; the export JSON holds the threads. *Walked (list, reopen with 8 bubbles, delete through the sheet) and tested (another person gets 404, account delete leaves zero rows, `coachThreads` in the export with both messages).*
- [x] Switching AI features off in Settings replaces the coach with the consent card. *Walked.*
- [x] Looks right at 360, 390 and 430 wide, dark and light, keyboard open (composer above the keyboard, list scrolls under, last message visible); no horizontal scroll; no console errors. *Walked: no horizontal scroll on the consent, chat, threads, Today and gym Week at all three widths, dark and light; no console errors; the composer sits at the bottom of the viewport when focused. A real on-screen keyboard was not available headless: the composer pads itself by the visual-viewport inset the way the sheets do, so the iOS check is on the phone.*
- [x] Smoke: ten questions as Finn and Tess; every number traced to the briefing or a tool result; no diet-pattern, allergy or dislike conflicts; the table in the report. *Run 2026-11-03 against `gpt-5.5-2026-04-23` on a fresh seed, all 22 rows OK, no conflicts. The three "numbers not traced" are the model's own subtraction of what is left (150 − 45 = 105 g, 100 − 18 = 82 g, 1,570 − 400 = 1,170 kcal), all right; the briefing's TODAY lines now spell "N left" out so later runs quote it. A first run on the stale seed (Finn with 11b's pinned energy and knee note still in place) had the model decline to re-draft the note, as the prompt says; the smoke needs `pnpm db:seed` on clean personas. Three smoke fixes from the run: numbers in the question count as seen, draft tools are not re-run (that spent a second estimator call and compared against a different estimate), and the estimate card's totals count as seen. Answers take 2 to 5 s with no tool, 9 to 15 s with a draft (the estimator is 6 to 10 s of that); one turn is about 5,500 input tokens.*

| Who | # | Question | Tools | Cards | Words | ms | Tokens in/out | Numbers not traced | Conflicts | OK |
|---|---|---|---|---|---|---|---|---|---|---|
| finn | 1 | How am I doing this week? | none | - | 98 | 3798 | 5513/137 | - | - | yes |
| finn | 2 | What should I eat tonight to hit my protein? | none | - | 79 | 2968 | 5516/106 | 105 | - | yes |
| finn | 3 | Why is my fat target what it is? | none | - | 69 | 2262 | 5515/102 | - | - | yes |
| finn | 4 | Am I getting stronger on squat? | get_lift_history | - | 79 | 4228 | 11454/140 | - | - | yes |
| finn | 5 | I'm 300 kcal short most days, should I change my target? | none | none (reasoned) | 90 | 2420 | 5520/122 | - | - | yes |
| finn | 6 | Log 2 eggs and toast for breakfast | draft_food_log | estimate | 22 | 10978 | 11318/65 | - | - | yes |
| finn | 7 | Plan me a 45 minute upper body session like last week's | get_workout, get_workout, draft_workout | workout | 60 | 9146 | 18415/631 | - | - | yes |
| finn | 8 | Is my weight trending the right way? | none | - | 66 | 2090 | 5514/97 | - | - | yes |
| finn | 9 | What am I lacking? | none | - | 87 | 2496 | 5511/139 | - | - | yes |
| finn | 10 | What did I eat on Tuesday? | none | - | 58 | 3386 | 5513/173 | - | - | yes |
| finn | 11 | Remember that my left knee is sore | remember_note | note | 35 | 3371 | 11122/75 | - | - | yes |
| tess | 1 | How am I doing this week? | none | - | 100 | 5037 | 5545/133 | - | - | yes |
| tess | 2 | What should I eat tonight to hit my protein? | none | - | 77 | 2514 | 5548/109 | 82 1170 | - | yes |
| tess | 3 | Why is my fat target what it is? | none | - | 63 | 1943 | 5547/85 | - | - | yes |
| tess | 4 | Am I getting stronger on squat? | none | - | 64 | 3399 | 5545/139 | - | - | yes |
| tess | 5 | I'm 300 kcal short most days, should I change my target? | none | none (reasoned) | 94 | 3385 | 5552/133 | 110 | - | yes |
| tess | 6 | Log 2 eggs and toast for breakfast | draft_food_log | estimate | 22 | 12556 | 11384/67 | - | - | yes |
| tess | 7 | Plan me a 45 minute upper body session like last week's | get_gym_week, get_workout, draft_workout | workout | 67 | 15130 | 24754/925 | - | - | yes |
| tess | 8 | Is my weight trending the right way? | none | - | 76 | 1927 | 5546/112 | - | - | yes |
| tess | 9 | What am I lacking? | none | - | 80 | 2177 | 5543/114 | - | - | yes |
| tess | 10 | What did I eat on Tuesday? | none | - | 54 | 2987 | 5545/174 | - | - | yes |
| tess | 11 | Remember that my left knee is sore | remember_note | note | 38 | 3284 | 11187/81 | - | - | yes |

- [x] `pnpm typecheck && pnpm lint && pnpm test` green; migration applies from fresh and from 0013. *Green (shared 198, api 180, web 53). Migrated `diet_tracker` from 0013 (one applied) and a fresh `diet_tracker_fresh` (fifteen applied).*

**Deferrals.** The live-model checks (streamed answer on screen, the four Finn answers, the smoke table) wait on a working OpenAI key; the code paths are covered by the scripted-model tests. The sparkles button sits on Today and Week in both halves, not on Meals and Workouts, because the header's right column holds one icon and those screens already use it for "+". Earlier turns are replayed to the model as plain messages, not as function calls with reasoning items (ai-coach skill, "State"). No real-phone keyboard check. 11b: whether the model reaches for the draft tools when asked, describes the card and never claims the action is done, is the prompt's rule and untested against the live model; the estimate card's live path (the estimator inside `draft_food_log`) likewise. A clarifying question on an estimate card goes back to the coach as the next message rather than re-running the estimator in place. A card drafted while a turn is still streaming holds its buttons until the turn is stored.

### 11b - Cards: let the coach draft actions

**In scope.** The five draft tools and their cards (`estimate`, `target_change`, `workout`, `meal`, `note`): `draft_food_log` runs the estimator with the same cap and foods memory and the card is the existing review card, confirm through the existing log endpoint with the usual "save to My foods" and "Add to meals" behaviour; `draft_target_change` dry-runs the pin through the engine and shows before and after with dependants and the floor check, confirm through the overrides patch; `draft_workout` opens the session screen with the plan filled in; `draft_meal` saves through the meals endpoint; `remember_note` with `coach_notes` (migration 0015), Coach > Notes to read and delete, notes read into the briefing. Cards persist in the message and show their state (drafted, confirmed, dismissed). Smoke extended with questions 5 to 7.

**Done when.**
- [x] "Log 2 eggs and toast for breakfast" shows an estimate card and writes nothing until Confirm; after Confirm the entries are on Today for the right meal and the card reads Logged. *Walked at 390x844 dark with a card built from the estimator fixtures (the estimator itself needs a working key): the review card with items, meal and day, "Add to breakfast"; no entry written before the tap; after it three entries (eggs, toast, butter) under breakfast on the day log and the card reads Logged, still Logged after a reload. The tool path (`draft_food_log` → estimator, same cap and foods memory) is tested with the cap error going back to the model as words; the live estimate waits on the key.* *2026-11-03, live: "Log 2 eggs and toast for breakfast" drafted the estimate card through the real estimator (two items, Eggs and Toast, "Add to breakfast"), the coach described it and told the person to tap, nothing was written before the tap, two breakfast entries after it, Logged after a reload.*
- [x] "Should I drop my calories by 200?" shows a target change card with the current and proposed energy, the recomputed fat and carbs, and a floor note; Apply pins it through the existing patch and the Targets screen reads "Set by you". *Walked: 3,250 → 3,050 kcal with carbs 460 → 420 g, fat 90 → 85 g (and fibre, added sugar and saturated fat, which the engine also derives from energy), "Above the safe minimum of 1,730 kcal", nothing written before Apply, pinned to 3,050 after it, Targets reads "Set by you", the card reads Applied after a reload. Tested: the dry run equals `computeTargets` with the new overrides; 500 kcal is refused with the floor and no card.* *2026-11-03, live: asked "Should I drop my calories by 200?" the model reasons against it (the plan check wants two weeks of data first) and offers to draft, which is the prompt's rule for a "should I"; told "Set my calorie target 200 lower" it drafted the card (3,250 → 3,050 kcal, carbs 460 → 420 g, fat 90 → 85 g, floor line) in 5.6 s, Apply pinned it, Targets reads "Set by you". The card's reason line came back as "User asked to set calorie target 200 kcal lower", so the tool now tells the model the reason is written to the person.*
- [x] "Plan me a 45 minute upper body session like last week" shows a workout card; Start opens the session with the exercises and sets filled and last time's numbers beside them. *Walked: bench, overhead press and rows with 77.5 kg × 5 planned and 75 kg × 5 "last time, 31 Oct" beside each set; Start opened `/workouts/<id>` with the three exercises, the planned numbers in the inputs and "Last time 31 Oct" on the rows; the card reads Started. Tested: exercises matched by name, last time's sets from the history, an unmatched name kept as a snapshot and named to the model.* *2026-11-03, live: the model read the week ending Tue 27 Oct, opened that session and drafted "Upper" (bench 75 kg × 5 and rows 60 kg × 8, three sets each, "last time, 27 Oct" beside them) in 13 s; Start opened the session filled in with "Last time 27 Oct" on the rows; Started after a reload.*
- [x] "Remember that my left knee is sore" saves a note after Confirm, the note appears under Coach > Notes, and the next turn's briefing carries it. *Walked: the note card, no note before Remember, one after, listed under Coach > Notes; Finn's briefing then ends with "NOTES … Mon 2 Nov 2026-11-02: …left knee is sore" (printed from `buildBriefing`; the same check is in the test).* *2026-11-03, live: the note card in 4.8 s, Remembered, listed under Coach > Notes; a meal card ("Save my lunch as a meal", 10 s, through `search_my_foods`) dismissed and still Dismissed after a reload with the meals count unchanged; "Am I getting stronger on squat?" showed "Looking at your last 5 squat sessions" and answered 100 kg × 5 on Sun 25 Oct to 105 kg × 5 on Sun 1 Nov, no ISO dates.*
- [x] Dismissing a card leaves it dismissed after a reload; nothing was written. *Walked on a meal card: Dismissed, still Dismissed after a reload, the meals count unchanged. Tested: the state is recorded once (a later confirm cannot undo a dismiss), another person's patch is 404.*
- [x] Widths, themes, keyboard, offline, tests and smoke as in 11a. *No horizontal scroll with cards at 360, 390 and 430, dark and light; the composer stays in the viewport when focused; offline disables the composer and the confirms ("Apply (offline)"), Start excepted since it needs no network; no console errors from the app (the walk's bogus key made Targets' explanation answer 503, as any dead key does). Green: shared 198, api 169, web 53; migration 0015 applied from 0014 and from fresh. Smoke: extended with the card checks and question 11, not run (no working key, see 11a).*

### 11c - The coach comes to you

**In scope.** A one-line brief on Today in each half ("Protein is 40 g short with dinner to go" / "Leg day planned; last squat 105 kg × 5"), built in code from the briefing with the model asked only for the sentence, generated at most once a day per half on open (D17's pattern), cached on the day, tapping it opens `/coach` with that context. Weekly review regenerated through the coach's briefing so the two agree. Owner's cost view: `ai_calls` by purpose and user for the last 30 days behind an owner-only route.

**Done when.**
- [x] Today shows the brief within two seconds of opening, once a day, and tapping it opens the coach with the brief as the first assistant line. *Walked at 390x844 dark with a fake writer in place of the model (the key on this machine is dead): the line appeared 188 ms after Today opened in the food half and 210 ms in the gym half; a reload served the same line (one `coach_briefs` row for the day); tapping it opened `/coach/<id>` with the line as the first assistant bubble and the composer under it, and the reply was answered with the line in the model's history (tested: the thread replays it as an assistant message). Tapping an unanswered brief again reuses that chat; once answered, a fresh one opens, and the chat list shows only answered chats.* *2026-11-03, live: the model's line ("1,950 kcal and 70 g protein left, with dinner to go.") was on Today 1.4 s after a cold open (the model call is 1.4 to 2.2 s of that) and 0.1 s on a reload; the gym line ("1 of 4 sessions done this week; last top lift was barbell back squat 105 kg × 5.") in 1.9 s; every number in both is on the screen below; the chat it opens starts with the line and the reply was streamed.*
- [x] The brief's numbers match the Today screen; with nothing logged it invites the first entry rather than judging. *Walked: every number in the line (1,950, 1,300 and 3,250 kcal) is on the Today screen below it, and the API holds the model to the same rule (`acceptableSentence`: a sentence carrying a number the facts do not hold, or over 160 characters, is dropped for the app's own sentence; tested with "999 g"). A fresh account reads "Nothing logged yet today. Log what you've had and I'll tell you where you stand." on Today and "No sessions in the last two weeks. Log one and I'll track your lifts here." in the gym: no model call, nothing cached, no "short" or "over" (tested and walked at 360 light); after the first entry the line has numbers.*
- [x] The cost view lists calls, tokens and web searches by purpose and user. *Walked at 390 dark, 390 light and 430 dark: four tiles (calls with the failed count, web searches, tokens in, tokens out), a By purpose list and a By person list with each person's purposes under them. The AI costs row under You and `GET /api/v1/ai/costs` exist only for the account named by `OWNER_EMAIL`; another account sees no row and gets 404 (tested and walked).* *2026-11-03, live: as Finn (`OWNER_EMAIL`) the view lists Coach turns, Food estimates, Daily briefs, Weekly reviews and Plan explanations with calls and tokens, and the walk account under By person.*

**Shipped.** Shared: `packages/shared/src/coach/brief.ts` (the brief, its halves, the request, the model's `{ sentence }` shape, the optional body of `POST /coach/threads`), `packages/shared/src/ai/costs.ts` (the cost rows and the `sumAiCosts` and `groupAiCosts` helpers), purpose `brief`, `owner` on the public user, `OWNER_EMAIL` in the env schema. DB: `coach_briefs` (migration 0016), purged by `day` under retention, in the export as `coachBriefs` (schema 6). API: `apps/api/src/ai/coach/brief.ts` (`draftBrief` builds the facts and the app's own sentence from the briefing inputs for either half; `getBrief` returns the day's cached line or asks the model to say the sentence better, checks every number against the facts, and stores only a sentence that passed; `briefModel.override` for tests), `POST /coach/brief`, `POST /coach/threads` with `{ brief }` (`openBriefThread`), `GET /ai/costs` (`apps/api/src/ai/costs.ts`) behind `isOwner` (`auth/owner.ts`), `callStructured` takes a `model` (the brief uses the coach's). The briefing is now built from exported sections (`personLines`, `targetLines`, `todayLines`, `weekLines`, `gymLines`, `weightLines`, `planCheckLines`, `notesLines`) and the weekly review's prompt is composed from the same PERSON, TARGETS and THIS WEEK sections (in full day detail), so the review and the coach quote the same numbers, the same rounding (serves to one decimal, everything else whole) and the same "met" / "not met" words. Web: `features/coach/BriefCard.vue` on Today in both halves (consent first; a skeleton line while it loads; tap opens the chat; disabled offline), `features/you/CostsScreen.vue` at `/you/costs` with the row under You for the owner, the brief query dropped on every log and session write. `pnpm ai:smoke:brief`. Tests: `brief.test.ts` (the drafts for both halves from the seeded data, the invitations, the number check, the once-a-day cache, the refusal of an invented number, no call on an empty day, without a key or at the cap, the chat a brief opens and its reuse, export and retention, the cost view and the owner flag); the coach test helpers moved to `test-helpers.ts`; the weekly review test now reads the shared sections.

**Deferrals.** The live model has not written a brief (dead key, see 11a); `pnpm ai:smoke:brief` prints both halves for Finn and Tess with the number check once a key is in. The brief is written once a day per half, so a line written at breakfast still reads "with lunch and dinner to go" at night; the empty-day invitation is the one line that changes during the day (it is never cached). The weekly review was not regenerated against the live model; its prompt now carries all nine TARGETS lines (not five key targets) and the full day lines, so read the first live review for length. No real-phone check. The costs view shows counts and tokens, not money (prices change; D42 notes the option). *Superseded 2026-11-05: the model no longer writes the brief and nothing caches it, so the line moves with the log; see "Follow-up - The brief moves with the day" below.*

**Decisions it depends on.** D41 (accepted 2026-11-02: one agent, our database for state, cards not writes, streaming, header placement), D25 (consent copy extended), D27 (retention), D24 (export), D6 and D11 (model), D38 (placement across halves), D40 (uncapped energy in the briefing).

---

## Follow-up - A year of history (D27)

**Status:** done (2026-11-03)

**Goal.** The owner asked for the food side's history to be kept for a year instead of six months, and for every history view to reach a year, for long-term progress analysis.

**Shipped.** Shared: `RETENTION_DAYS` 365 (was 183); `MAX_RANGE_DAYS` 365, which caps the weigh-in API's `days` (was 183), `MAX_WORKOUTS_RANGE_DAYS` (was 92) and the coach's `get_weight_history`; `GET /exercises/:id/history` takes `from` and a `limit` up to `MAX_EXERCISE_HISTORY_SESSIONS` (400). Web: `lib/ranges.ts` holds the ranges. Progress offers 4 weeks, 3 months, 6 months and 1 year. The Workouts list offers 3 months (the default, as before), 6 months and 1 year, and says "No sessions in the last 6 months" rather than "No sessions yet" when older sessions exist. A lift's page offers 4 weeks, 3 months (the default), 6 months and 1 year instead of its last 20 sessions (`useExerciseTrend`), and a lift not done in the range says "Not done in the last 3 months. You last did it on 6 Jun 2026." `LineChart` draws a dense series (points closer than one marker on average) as one joined line with only the latest, today's and the touched point marked, and its readout snaps to the nearest point with a value. Range reads over three months stay out of the offline mirror (D21). The privacy policy says a year and has its own updated date (3 November 2026). Written up in D27, D21, D36 and `docs/TRAINING-MATHS.md`.

**Done when.**
- [x] The purge keeps a year of the food log, weigh-ins, reviews, chats, briefs and AI rows. *`retention.test.ts` cuts at `RETENTION_DAYS`; `brief.test.ts` seeds its expired brief at `RETENTION_DAYS + 17` (it used 200 days, which a year keeps); the API's boot purge ran with the new cutoff and deleted nothing.*
- [x] Progress at 1 year shows a year of weigh-ins with the trend visible, the Change tile reads "over 1 year", and a tap reads out the nearest weigh-in. *Walked with Playwright at 390x844 dark, 360x780 light and 430x932 dark against Vite (:5177) and a fresh API (:3201), with a user seeded through the API: weigh-ins every 4 days for 11 months and daily for the last month, 103 squat sessions across the year, one 400 days back, bench only 200 and 150 days back.*
- [x] A lift's page starts on 3 months and its session count grows with the range (8, 25, 52, 103), the year holding every session in the year and not the one 400 days back; Best is the best in the range; about five dates under the chart at a year. *Walked at all three widths.*
- [x] Bench, last done 150 days ago, reads "Not done in the last 3 months. You last did it on 6 Jun 2026. Pick a longer range above." and shows its two sessions at 1 year. *Walked.*
- [x] The Workouts list shows 25, 52 and 104 days of sessions at 3 months, 6 months and a year, with "Showing the last year." under the year. *Walked.*
- [x] After visiting the year views, the offline mirror holds only the ranges under three months (about 90,000 characters). *Read from `localStorage` in the walk.*
- [x] At 4 weeks the weight chart keeps a dot per weigh-in; at 3 months and longer with daily weigh-ins it draws the line with the latest point. *Screenshots read at 390 dark and 360 light.*
- [x] No horizontal scroll and no console errors on every screen above, both themes.
- [x] Tests: `progress.test.ts` (a 300-day-old weigh-in read at `days=365`, 366 refused), `training.test.ts` (a 365-day `GET /workouts` with a 300-day-old session, the history `from` filter with `limit`, a `limit` of 401 and a bad `from` refused).

**Deferrals.** No real-phone check. The coach's `get_lift_history` still reads at most 20 sessions; a year would put every session's sets into each coach turn. The food Week and History screens step back a week or a month at a time without a limit, as before; past a year they are empty. There is no single chart of calories, protein or day scores over months; the long views are weight, lifts and the session list. With a mouse, clicking the chart clears the readout that hovering opened (the hover handler runs first); a finger works. This predates the change.

**Decisions it depends on.** D27, D36, D21.

---

## Follow-up - Planned food (D43)

**Status:** done (2026-11-04)

**Goal.** The owner asked to add food as "planned": meant to be eaten and not eaten yet, shaded on the charts at the top with the numbers showing only what was eaten, and to step Today one day forward and plan tomorrow, where plan is the only option.

**Shipped.** Shared: `packages/shared/src/log/planned.ts` (`MAX_PLAN_DAYS_AHEAD`, `PLAN_GRACE_DAYS`, `lastPlanDay`, `firstPlanDay`, `planExpiresAfter`, `leftoverPlanDays`, `isPlanOnlyDay`, `entryDayProblem`), `planned` on the entry, the create, the entry patch and the group patch, export schema 7. DB: `log_entries.planned` (migration 0017). API: `recomputeSummary` leaves plans out; every write checks the day against the person's local today; a plan ticked off takes `logged_at` from now; `purgeExpiredPlans` deletes plans 48 hours after their day ends, hourly and at boot; the log CSV gains a `planned` column. Coach: `get_day_food` returns `planned_not_eaten` and can read tomorrow, the briefing gains one line, the brief and the briefing count eaten food only, one prompt rule. Web: `MealDayPicker` (Planned with the meals, Tomorrow with the days), `PlannedList`, `EatPlanSheet`, `LeftoverPlansNotice`, the `planned` prop on `ProgressBar` and `Ring`, `atEnd` on `DayStepper`, `logDay` on `AppShell`, `plannedTotals` on `useDayLog`, the plan-only state of Today and the quick-add sheet.

**Done when.**
- [x] Every way of logging offers Planned beside the four meals and the button reads "Add to planned". *Submitted as plans at 390x844 through all four: Describe with one live estimate, Meals, My foods and Manual. The coach's estimate card is the same review.*
- [x] A plan shades the ring and the bars and changes no number. *520 of 3,250 eaten and 2,730 left before and after a 640 kcal plan; the ring label and the bars' `aria-valuetext` carry "plus 640 planned"; screenshots read in dark and light.*
- [x] The tick asks which meal, every time, and the food counts from then on in the meal picked. *Walked at 360, 390 and 430: the four meals on offer, closing the sheet leaves the plan a plan, 640 of 3,250 with 600 still shaded after the first, a saved meal goes whole and lands in Dinner when Dinner is picked at 13:50, where the clock would have said lunch, the card leaves with its last row and the toast survives it.*
- [x] A plan never ticked off is deleted 48 hours after its day ends, in the person's own time zone, and until then can be ticked from its day. *`retention.test.ts` to the minute in Auckland and Honolulu; a real API restart deleted a plan three days back and kept one two days back ("expired plans purged, deleted: 1"); ticked late, a plan stays on its day; the list on a past day reads "The rest clears after 4 Nov."*
- [x] Planned is not offered, and the API refuses a plan, further back than plans are kept. *`log.test.ts`; walked: Planned at two days back, gone at three with a meal left chosen.*
- [x] A plan left unticked on a day gone by shows as one line on Today, which opens that day's list. *`leftover-plans.test.ts`; walked at 390, 360 by 640 in light, and 430: 44 px tall everywhere and on one line with the longest wording; no line for eaten food, today's or tomorrow's plans or a plan past its 48 hours; a saved meal counts as one; two days add up and open the older; the plan and its tick land in view; a tick or a delete updates the line without a reload; offline it still opens the day; axe clean in both themes.*
- [x] A saved meal planned as a whole stays one row and can be moved or eaten whole, or one ingredient at a time. *Walked; `log.test.ts`.*
- [x] Today steps to Tomorrow and no further; tomorrow offers Planned alone, has no tick and hides water, food groups and vitamins; the centre + plans for the day on screen; moving a plan to today brings the meals back. *Walked.*
- [x] The API refuses eaten food on tomorrow and anything past it. *`log.test.ts` and the walk: "That day hasn't happened yet, so it can only be planned."*
- [x] Scores, the week and the coach never count a plan. *`stats` reads `daily_summaries`, which holds no plans. `coach.test.ts` and `brief.test.ts`; two live turns against the model: it reported 520 kcal eaten with the curry "not counted yet", read tomorrow's plan, and worked out 1,890 kcal left if the plan is eaten.*
- [x] Offline, a plan queues, shows as waiting, shades the chart and counts for nothing, and reaches the server as a plan. *Walked with `setOffline` on the dev server and on the production build with its service worker, across a reload, after fixing the queue (below).*
- [x] No horizontal scroll, the five segments and the four day chips fit at 360, 390 and 430 in both themes; axe clean on tomorrow, Today with a tick, the editor, the meal sheet in both themes and a plan on a past day. *Walked.*
- [x] Migration 0017 applies from the previous state and from a fresh database.

**Found on the way.** Offline food logging had stopped working: a write never reached the queue because TanStack pauses mutations while offline, so the sheet sat there and nothing was saved until the connection came back. An ordinary eaten meal did the same. Fixed with `networkMode: 'always'` on the three hooks that handle offline themselves (D21).

**Deferrals.** No real-phone check. The coach cannot draft a plan itself; its estimate card offers Planned and Tomorrow and the person picks them. Food groups and vitamins do not shade (they are pips and tiles, not bars, and the owner asked for the charts at the top).

**Decisions it depends on.** D43, D21, D33.

---

## Follow-up - The brief moves with the day, and the cost view in pounds (D41, D42)

**Status:** done (2026-11-05)

**Goal.** Two things from the owner's first days of use. The line at the top of Today "always seems to be wrong": it said 2,900 kcal were needed when 910 were. And the AI costs screen shows tokens, which "doesn't tell me much"; it should show accurate prices, with a small switch between tokens and pounds.

**Cause of the first.** The brief was written once a day by the model and cached (`coach_briefs`). Written after the first entry, it kept that moment's numbers for the rest of the day. Of the three fixes offered (D41, amended) the owner chose to drop the model for this line.

**Shipped.** API: `getBrief` builds the line from `loadBriefingInputs` on every request, with no model call and no cache; `draftBrief` returns the sentence only; `biggestGainLine`, the facts, `acceptableSentence`, the brief prompt, `briefModel.override` and the smoke script are removed. `ai_calls.cached_input_tokens` (migration 0018), filled by `callStructured` and the coach loop from `usage.input_tokens_details.cached_tokens`. `aiCosts` sums per model, prices each sum with `aiCostUsd` and folds back to person and purpose. Shared: `ai/pricing.ts` (the price table, `modelPrice`, `aiCostUsd`), the cost row's money fields, `totalAiCostUsd`, env `USD_TO_GBP`. Web: `CostsScreen.vue` has a £ / Tokens `PillToggle` in the header, pounds first; the privacy policy no longer lists the brief among what is sent to OpenAI.

**Done when.**
- [x] The brief on Today matches the ring after every log write. *Walked at 390x844 dark as Finn against Vite and a fresh API on a private Postgres: the line read "Energy is 2,550 kcal short with dinner to go: 700 of 3,250 kcal so far." with the ring at 2,550 kcal left; after logging 500 kcal it read "Energy is 2,050 kcal short with dinner to go: 1,200 of 3,250 kcal so far." with the ring at 2,050. `brief.test.ts`: the line follows two entries in a row, makes no `ai_calls` row and no `coach_briefs` row with a key set, and ignores a line a model stored earlier the same day.*
- [x] The costs screen shows pounds by default and tokens on a tap. *Walked at 390 dark, 360 and 430 with seeded calls: Total £2.60 and "8.7p a day", Searches £0.13, Tokens in £1.41, Tokens out £1.06 (the three add up to the total), each purpose and person with its pounds first, amounts under 10p in pence ("1.3p"), "1 unpriced" on the row holding a call on an unlisted model and the sentence above saying it is left out. The Tokens side is the old screen. No horizontal scroll, no console errors.*
- [x] The money is right to the price list. *`pricing.test.ts`: a coach round on gpt-5.5 priced by hand (1,500 fresh and 4,000 cached input tokens, 150 out), a dated snapshot read as its model, "gpt-5-mini" never priced as "gpt-5", a cent per search, an unlisted model null. `brief.test.ts`: the API's rows for two coach rounds, an estimate with two searches and an unlisted model.*
- [x] Typecheck, lint, tests (shared 223, api 196, web 62). Migration 0018 is one `ADD COLUMN`, applied from fresh and on top of 0017.

**Deferrals.** No real-phone check. Docker was not running, so the tests and the walk used a private Postgres on another port rather than the compose one. The pounds are list price times tokens, not the invoice (D42). Calls logged before 2026-11-05 have no cached count and read high for 30 days. The exchange rate is a fixed env value. `coach_briefs` is left in place, unused (OUTSTANDING). A tapped brief opens a chat that starts with the line as it was when tapped; an unanswered one is reused only while the line is unchanged, so a few empty threads can be left behind (hidden from the list, purged with the rest).

**Decisions it depends on.** D41 (amended 2026-11-05), D42 (money), D25, D27.

---

## Follow-up - Bodyweight counts toward the kilograms lifted (D44)

**Status:** done (2026-11-05)

**Goal.** From the owner: bodyweight exercises were not counting at all. A push-up scored 0 kg; it should score at bodyweight, a pull-up the same, any bodyweight exercise the same, with exceptions such as crunches worked out, and past sessions backdated if that does not cost code quality.

**Cause.** Volume was `weight × reps` and a bodyweight rep has no weight.

**Shipped.** Shared: `bodyweightLoadKg`, `defaultBodyweightShare`, `setLoadKg`, `fillBodyweightLoads`, `bestSetAcross`; `setVolumeKg`, `exerciseVolumeKg`, `setMetricValue`, `bestSetBy`, `bestSetAt` and `compareWeeks` read a block's bodyweight load; `bodyweightShare` on the exercise schemas and `bodyweightKg` on blocks and history entries. DB: `exercises.bodyweight_share`, `workout_exercises.bodyweight_kg`, migration 0019 with the catalogue's shares and the backfill. API: `upsertWorkout` works the load out once per block from `bodyWeightOn`; `exerciseHistory` returns it; custom exercises default by kind. Web: the draft store fills loads offline and takes the server's after a save; the line under the exercise name and "+ kg"; the share choice when adding a bodyweight exercise; bodyweight wording on the lift page and the week card. Coach: its totals and best sets include it, `get_workout` names the load. The rules are in `docs/TRAINING-MATHS.md`.

**Done when.**
- [x] Push-ups show up in the totals at bodyweight. *Walked at 390x844 dark and 360 as Finn (75.1 kg today) against Vite and the API on a private Postgres: a new session with 20 push-ups and 5 pull-ups with 10 kg read "1,928 kg lifted" in the tally (75.1 × 20 + 85.1 × 5), "Each rep counts 75.1 kg of your bodyweight" under each, and the same on the Workouts list and the Week tiles. No horizontal scroll, no console errors beyond the signed-out 401s.*
- [x] Past sessions are backdated. *Migration 0019 run on a copy of a database at 0018 with bodyweight blocks added first: push-ups on 16 Oct (before the first weigh-in) got 74.4 kg, the earliest weigh-in; pull-ups on 3 Nov 74.9 kg, the weigh-in the day before; a hanging leg raise 26.2 kg; a custom bodyweight exercise 74.9 kg; a plank and 18 barbell blocks none. Run twice; the second run applied nothing. The 16 Oct session then read 6,024 kg on its screen.*
- [x] Exceptions are worked out. *The share table in TRAINING-MATHS. `training.test.ts`: the catalogue's shares match the code, a hanging leg raise at 82 kg stores 28.7 kg.*
- [x] The figure is the server's and does not move. *`training.test.ts`: the weight on the day is the latest weigh-in before it, else the earliest after; a re-save after a new weigh-in keeps 82 while a new block gets 85; a value of 5 sent by the client is ignored; a block keeps its load after its custom exercise is deleted; no weight on file gives no load.*
- [x] Typecheck, lint, tests (shared 234, api 202, web 62). The API suite migrates a fresh database, 0019 included.

**Deferrals.** No real-phone check and not checked on Railway; the migration runs on the next deploy. Docker was not running, so the tests and the walk used a private Postgres. Existing custom exercises could not have their share changed in the app (fixed the same day, next follow-up). The push-up was first built at all of bodyweight and moved to 0.7 the same day. Under "Heaviest weight" an unweighted pull-up still has no best. See OUTSTANDING.

**Decisions it depends on.** D44, D35, D36, D39, D19, D27.

---

## Follow-up - Edit your own exercises, the measured push-up, crunch and sit-up (D44)

**Status:** done (2026-11-05)

**Goal.** The owner's answers to the two questions left by the bodyweight follow-up, and one request: the push-up at whichever share is most accurate; whatever is best for crunches; and a way to edit the exercises they have created, which did not exist.

**Shipped.** DB: migration 0020 sets the push-up's share to 0.7, rescales the push-up loads already stored, and adds Crunch (0.3) and Sit-up (0.5) to the catalogue (76 rows). API: `updateExercise` runs in a transaction, renames the exercise on the person's logged blocks and re-works their loads when the share changes (`restampBlocks`). Web: `ExerciseForm.vue` (the add form, now also edit and delete), opened from a pencil beside your own exercises in the picker and in the header of a Lifts page; `useUpdateExercise`; the draft store's `applyExercise` brings a session open on the phone into line. "About two thirds" joins the share choices.

**Done when.**
- [x] An exercise of your own can be changed from the picker and from its Lifts page. *Walked at 390x844 dark and 360 as Finn against Vite and the API on a private Postgres: added "My crunch" (Bodyweight, all of it) to a session, 10 reps, tally 751 kg at 75.1 kg a rep; pencil in the picker, the form opened filled in; renamed and set to about a third; the open session showed the new name, "Each rep counts 22.5 kg" and a tally of 225 kg, and the stored block agreed. From its Lifts page: set to about half, stored load 37.5 kg. No horizontal scroll, no console errors.*
- [x] It can be deleted, and sessions keep it. *Same walk: two taps on Delete in the Lifts page form returned to Lifts, the exercise row was gone, and the session still listed the block by name with its load.*
- [x] An edit reaches logged sessions and nobody else's. *`training.test.ts`: a rename shows on the saved block; 1 to 0.3 rescales 82 kg to 24.6; a later weigh-in for that day does not move a rescale; 0 clears and back to 1 reads the weight on the day; a re-save from a phone with the old name keeps the load; another person gets 404.*
- [x] The push-up is 0.7 and history follows. *Migration 0020 on a database at 0019 holding push-up blocks: 74.4 kg became 52.1 and 75.1 became 52.6, pull-ups untouched; run twice, the second applied nothing. A new push-up block on the phone read "Each rep counts 52.6 kg".*
- [x] Typecheck, lint, tests (shared 234, api 203, web 62).

**Deferrals.** No real-phone check; not checked on Railway. A rescale carries the 0.1 kg rounding of the stored load, so moving a share back and forth can drift by 0.1 kg a rep. An exercise can be edited only where it is listed: the picker (inside a session) or its Lifts page (once it has been logged).

**Decisions it depends on.** D44, D35.

---

## Ideas after slice 6 (not planned)

- Coach chat moved to Slice 11 (D41) on 2026-11-01.
- Photo-of-meal estimation via the vision model.
- Barcode scanning with Open Food Facts lookup.
- USDA FoodData Central as a second resolver for whole foods (D5 option B).
- Meals, next steps: "Save as a meal" on a meal group already in the day log; show a logged meal's ingredients under one collapsible header (D29 option C); a "refresh from My foods" button in the meal editor (D28). ("Add to meals" while describing a meal shipped as slice 7.)
- Sharing a week summary with a friend or coach.
- Apple Health / Google Fit weight sync via Capacitor.
