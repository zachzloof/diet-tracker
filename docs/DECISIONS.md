# Design decisions

Big choices, each with the options considered, a recommendation, and a status. The owner decides; Claude builds on the recommended option only when the owner has said so or when waiting would block a slice (and then says so in the report).

Status values: `proposed` (awaiting the owner), `accepted`, `superseded` (link to the replacement).

Small defaults that are not decisions are listed at the bottom so they're visible without asking.

---

## D1. Frontend framework and the path to the App Store

**Context.** Owner prefers Vue but is open to whatever makes the App Store easiest. Friends will use it from a phone home-screen bookmark first.

**Options.**
- **A. Vue 3 + Vite + TypeScript as a PWA now, wrapped with Capacitor for iOS/Android later.** Capacitor bundles the same web build into a native shell and gives access to camera, push, HealthKit etc. via plugins. No rewrite. Web experience is first-class (install prompt, offline, home-screen icon, HTTPS via Railway).
- **B. React + Vite now, React Native/Expo later.** A "true native" feel eventually, at the cost of rewriting the UI layer. React skills transfer, code does not.
- **C. Expo (React Native) from day one, with Expo web.** Native-first. Web/PWA output is weaker, iOS builds from Windows need EAS cloud builds, and the browser-first requirement suffers.

**Recommendation.** A. It honours the Vue preference and the App Store path is a wrapper, not a rewrite. Nuxt was considered and rejected: a plain SPA plus a separate API is cleaner to wrap with Capacitor and to run as one Railway service.

**Status.** `accepted` (2026-09-25)

---

## D2. Backend language, framework and repo shape

**Options.**
- **A. pnpm monorepo: `apps/web` (Vue), `apps/api` (Node 24 + Hono + TypeScript), `packages/shared` (zod schemas, nutrition engine, types).** One language end to end, shared types and validation, one Railway service serving both API and SPA.
- **B. Nuxt full-stack (Nitro server routes).** One app, but UI and API are coupled and the Capacitor story gets awkward.
- **C. Python FastAPI backend.** Nice AI tooling, but two languages, no shared types, and nothing here needs Python.

**Recommendation.** A. Hono over Express or Fastify because it is TypeScript-first, tiny, and validates with zod natively. Fastify is a fine fallback if Hono ever gets in the way.

**Status.** `accepted` (2026-09-25)

---

## D3. Database and ORM

**Context.** Owner said Postgres on Railway is fine.

**Options.**
- **A. Postgres + Drizzle ORM with drizzle-kit migrations.** SQL-shaped, light at runtime, migrations are plain SQL files committed to git and reviewed like code.
- **B. Postgres + Prisma.** More magic, heavier engine, slower cold starts, migrations less transparent.
- **C. Postgres + Kysely (query builder) with hand-written migrations.** Maximum control, more boilerplate.

**Recommendation.** A.

**Status.** `accepted` (2026-09-25)

---

## D4. Authentication

**Options.**
- **A. Own email + password auth.** argon2id password hashing, database-backed sessions, HTTP-only `Secure; SameSite=Lax` cookies, rate-limited login. A few hundred lines we fully understand. Password reset needs an email provider (Resend free tier) and is deferred until someone needs it; for friends-only, an admin reset script covers it.
- **B. better-auth (library).** Email/password today, Google/Apple sign-in later by config. More dependency surface and churn.
- **C. Hosted auth (Clerk, Supabase Auth, Auth0).** Fastest, but an external dependency with per-user pricing at scale, which cuts against "free".

**Recommendation.** A now. Two notes for later: (1) if Google sign-in is ever added, Apple requires Sign in with Apple too, so add both at once; (2) at Capacitor time cookies inside a native WebView can be fiddly, so the session layer should be written so that switching to a bearer token in secure storage is a contained change (session lookup by token; the cookie is just the transport).

**Status.** `accepted` (2026-09-25)

---

## D5. How the AI estimates food

**Context.** "I had 4 eggs" must become nutrients. It will never be exact; it should be consistent, fast, and correctable.

**Options.**
- **A. Pure LLM structured estimation.** Free text goes to OpenAI with a strict JSON schema; the model returns items, grams, a full nutrient vector, food-group serves, confidence and its assumptions. Handles anything (restaurant meals, home cooking, "half of what was left"). Accuracy roughly plus or minus 10 to 25%. Simple to build.
- **B. LLM parse + USDA FoodData Central lookup.** The model only parses into canonical foods and grams; the server looks up USDA values; fallback to A when not found. More accurate for whole foods, another API key (free), a fuzzy-matching problem, and worse for mixed dishes.
- **C. A plus memory.** A, plus a per-user foods library: manual entries and confirmed AI estimates are saved, so "4 eggs" the second time is served from the user's own verified entry with no AI call. B can be slotted in later as an extra resolver without changing the schema.

**Recommendation.** C. It matches how people actually eat (the same 30 foods on rotation), cuts OpenAI cost, and makes numbers consistent day to day. Revisit B if accuracy complaints are about whole foods rather than portions.

**Status.** `accepted` (2026-09-25)

---

## D6. OpenAI model and usage pattern

**Context.** Owner wants the stronger models for accuracy.

**Options.**
- **A. One strong model for everything** (`OPENAI_MODEL`, default `gpt-5`). Simplest; every call gets the best estimate.
- **B. Two tiers.** Strong model for nutrient estimation and weekly reviews; a small model for low-stakes text (rephrasing a suggestion, meal name cleanup). Saves money at scale, one more thing to configure.

**Recommendation.** A to start, with the model ID in env so switching costs nothing. Add B only if the AI bill matters. Either way: Responses API, Structured Outputs with `strict: true`, a per-user daily call cap, request/response logging with token counts, and a 30 s timeout with one retry. Note: model IDs move; confirm the current strongest general model when slice 3 starts rather than trusting this document.

**Status.** `accepted` (2026-09-25)

---

## D7. Which nutrients to track

**Options.**
- **A. Core + key micros + food groups.** Energy, protein, carbs, fat, saturated fat, fibre, total sugar, added sugar, sodium; potassium, calcium, iron, magnesium, zinc, vitamins A, C, D, B12, folate; water; alcohol; food-group serves (vegetables, fruit, whole grains, protein foods, dairy or alternatives, legumes, nuts and seeds). 21 nutrient keys + 7 groups.
- **B. Macros + fibre + sodium only.** Most accurate from an LLM and simplest UI, but fails "track all the nutrients".
- **C. Full USDA panel (40+).** LLM estimates of obscure micros are mostly noise, and the UI drowns.

**Recommendation.** A. Micronutrients are shown with a status but weighted lightly in "day met" (see the nutrition-engine skill), because AI estimates of them are rough. Stored as a JSONB vector keyed by one enum, so adding a nutrient later is an enum change plus backfill rather than a wide-table migration.

**Status.** `accepted` (2026-09-25)

---

## D8. How daily targets are set

**Options.**
- **A. Deterministic engine + AI explanation.** Mifflin-St Jeor (or Katch-McArdle when body fat is known), then activity multiplier, then goal and pace adjustment with floors, then protein by g/kg per goal, fat as % energy with a g/kg floor, carbs as the remainder, then fibre, sodium, water and DRIs by sex and age. Pure functions, unit-tested with worked examples. The AI explains the plan in plain English and can suggest tweaks the user accepts. Every target is user-overridable within guardrails.
- **B. AI sets the targets.** Flexible, but not reproducible, hard to test, and can drift between users with identical inputs.
- **C. User sets everything manually.** No guidance, which fails the brief.

**Recommendation.** A. It is the only option that is both explainable and testable, and it keeps the AI bill out of onboarding.

**Status.** `accepted` (2026-09-25)

---

## D9. Styling and components

**Options.**
- **A. Tailwind v4 + our own small component set + Reka UI (headless) for dialogs, bottom sheets, tabs.** Full control of the look, accessible primitives, small bundle.
- **B. Full component library (PrimeVue, Vuetify, Naive UI).** Fast to assemble, but looks like every other admin panel and fights you when you want it to feel like a product.
- **C. Plain CSS with design tokens.** Total control, slowest to build.

**Recommendation.** A. The `mobile-ui` skill defines the design language so the look stays consistent across slices.

**Status.** `accepted` (2026-09-25)

---

## D10. Safety defaults (adopted, please confirm)

These are the conservative behaviours the nutrition engine will ship with unless told otherwise:
- Under 18: cannot use the app (also an App Store expectation for diet apps).
- Pregnant or breastfeeding, or a self-reported eating-disorder history: no calorie deficit, maintenance targets, and a clear note to seek professional guidance.
- Calorie floor: the greater of BMR and 1200 kcal (female) / 1500 kcal (male). Overrides below the floor show a warning.
- Fastest allowed pace: 0.75 kg/week loss or 0.5 kg/week gain.
- A disclaimer at onboarding and in Settings that the app is not medical advice.

**Status.** `accepted` (2026-09-25)

---

## D11. Which OpenAI model, given the account cannot use `gpt-5`

**Context.** D6 chose `gpt-5`. On 2026-09-25 the owner's OpenAI organisation is not verified, and the API answers `404 model_not_found: Your organization must be verified to use the model gpt-5` for both `gpt-5` and `gpt-5-mini`. The same key can use `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-4.1`, `gpt-4o`, `o3` and `o4-mini` without verification. The slice 2 smoke test and the browser walk were run with `OPENAI_MODEL=gpt-5.5` passed on the shell; `.env.example` still says `gpt-5`, and the deployed service will fail the explanation (targets keep working) until this is settled.

**Options.**
- **A. Verify the organisation** at platform.openai.com/settings/organization/general and keep `gpt-5`. Keeps D6 as written; needs ID verification and up to 15 minutes to propagate.
- **B. Set `OPENAI_MODEL=gpt-5.5`** locally and on Railway. The newest general model this key can reach; it produced natural, number-accurate explanations in about 8 seconds. Cost per call is unknown to Claude; check the pricing page.
- **C. Set `OPENAI_MODEL=gpt-5.4-mini` or `gpt-4.1`** for a cheaper explanation and revisit at slice 3, when food estimation needs the stronger model anyway.

**Recommendation.** B. It is one env var, matches "one strong model for everything", and slice 3's food estimation benefits from the same model. Switch back to `gpt-5` under A if verification is easy and pricing favours it.

**Status.** `accepted` (2026-09-25): B, `gpt-5.5` for now. The code default and `.env.example` say `gpt-5.5`; set the same on Railway.

---

## D12. Overrides are pins that feed back through the engine (adopted, please confirm)

**Context.** Slice 2 lets a person override any target. What happens to the others?

**Options.**
- **A. Replace one number.** Simple, but energy and macros stop adding up after an energy or protein change.
- **B. Pins.** The overridden value replaces the formula for that key and everything downstream follows: energy pins re-derive fat, carbs, fibre and the limits; protein or fat pins re-derive carbs as the remainder; a carbs pin is honoured with a note when the macros no longer match the energy target. Overrides are edited in place on the current target version, carried forward to a new version when still above the safety floor, and any override change drops the cached AI explanation so it can never contradict the numbers.
- **C. Every override creates a new target version.** Full audit trail, but history fills with tweaks and "days met" in slice 4 would flip retroactively within a day.

**Built.** B. Ranges and floors per target: energy range is TDEE minus 25% to plus 20% with the floor at max(BMR, 1200/1500/1350 kcal); protein range is the goal's g/kg band with a floor at 0.8 g/kg (1.2 g/kg from age 60); fat range 20 to 35% of energy (35 to 50% low carb) with a 0.5 g/kg floor; carbs floor 50 g (30 g low carb); micronutrients and food groups warn outside 0.8 to 2 times (0.5 to 2 times) the guideline.

**Status.** `accepted` (2026-09-25)

---

## D13. What the explanation call sends to OpenAI (adopted, please confirm)

The request contains the profile summary (sex, age, height, weight, body fat, goal, pace, activity, training, diet pattern, allergies, dislikes, units, safety flags) and every target with its reason. It never contains the email address or any identifier. Requests are sent with `store: false` so OpenAI does not retain them, reasoning effort `low` on reasoning models for speed, a 30 second timeout with one retry, and every attempt is logged to `ai_calls` with model, tokens, latency and outcome. A person's daily call cap (`AI_DAILY_CALL_CAP`) is enforced from slice 3, when calls become user-initiated.

**Status.** `accepted` (2026-09-25)

---

## D14. Confident AI items are saved to My foods by default (adopted, please confirm)

**Context.** D5 option C says confirmed AI estimates feed the person's library so the same food is consistent day to day and re-logs cost no AI call. Slice 3 had to decide which items to save without asking a question per item.

**Options.**
- **A. Save nothing automatically.** The library holds only manual entries and items the person explicitly saves. Clean, but the memory that D5 promised rarely fills up, and "4 eggs" is re-estimated every time.
- **B. Save items the model marked `high` confidence, with a per-item toggle on the review card.** Built. Packaged foods and precise counts ("4 eggs", "1 scoop whey") get saved as a per-serving food where one serving is exactly what was logged; rough guesses ("about a plate") do not. The chip on the row says "Will save" so nothing is silent, and items that matched an existing library food are never duplicated.
- **C. Save every confirmed item.** Fills the library fastest but with a lot of one-off restaurant guesses.

**Recommendation.** B. In the browser walk the second "4 eggs" already matched the saved "Eggs" food and the model said so in its assumptions. Switch to A if the library gets noisy; it is one default in the review card.

**Status.** `accepted` (2026-09-26): B.

---

## D15. The client computes portions and rescaled totals; the server stores what it is sent (adopted, please confirm)

**Context.** Re-logging 50 g of oats or changing "4 eggs" to 3 needs the nutrient vector scaled. Somebody has to do the arithmetic, and the server has no per-gram basis for an AI item (only totals for the quantity described).

**Options.**
- **A. Server recomputes from `food_id` and grams.** Exact for library foods, impossible for AI items and manual one-offs without a basis, so two code paths.
- **B. Client scales with the shared pure functions (`portionOf`, `rescaleToQuantity`) and sends the final totals; the server validates the shape (complete vector, no negatives, ownership of `food_id` and `ai_call_id`) and stores it.** Built. One code path, the numbers the person saw are the numbers stored, and the math lives in `packages/shared` with unit tests as non-negotiable 2 asks. The only "trust" is in a person's own diary.
- **C. Send both and have the server check them against each other within a tolerance.** Belt and braces, more code, and a hard question about what to do when they differ.

**Recommendation.** B. Revisit if a shared catalogue (`foods.user_id` null) ever makes server-side recomputation necessary.

**Status.** `accepted` (2026-09-26): B.

---

## D16. Named products are looked up online with OpenAI's web search tool (adopted, please confirm)

**Context.** "Asda mozzarella sticks" or "M&S fries" has an exact label on the retailer's website, and the owner expects those numbers rather than a generic guess. The estimator only had the model's memory, which is stale or approximate for own-brand supermarket products. The owner offered Tavily or any better-suited dependency.

**Options.**
- **A. OpenAI's built-in `web_search` tool on the same Responses call.** Built. No new dependency or key; the model searches when the prompt's rule triggers (a brand, retailer, chain or product is named), reads the label from the page, and still answers through the strict `FoodEstimate` schema, now with `brand` and `source_url` per item. Location hint from the profile time zone (GB for Europe/London). Cost is per search on top of tokens (see the OpenAI pricing page for the current rate); `ai_calls.web_search_calls` counts them per call so the bill per person stays visible. Adds a few seconds to a branded estimate; the call timeout is 75 s when the tool is offered. `AI_WEB_SEARCH=false` switches it off without a deploy.
- **B. Tavily (or Brave/Serper) search API, fed to the model.** A second key and dependency, our own "is this branded?" detection before the call, and a second round trip; the model would still have to read the page. More control over which sites are searched, and a free tier of about 1,000 searches a month.
- **C. Open Food Facts product lookup.** Free, no key, real label data with barcodes, but text search is fuzzy and UK own-brand coverage is patchy; better as a barcode scanner later than as the text path.

**Recommendation.** A. It is the smallest change that gives the label rather than a guess, and B or C can be slotted in as extra resolvers later without touching the schema. Watch `web_search_calls` in `ai_calls` for the first weeks; if the cost is out of line, switch to B or turn the flag off.

**Status.** `accepted` (2026-09-26): A, adopted so the fix could ship; the owner confirms or redirects.

---

## D17. The weekly review is generated on demand and cached, not by a cron job (adopted, please confirm)

**Context.** Slice 4 needed to settle the open question of how the AI weekly review gets made.

**Options.**
- **A. On demand, cached per ISO week.** Built. Opening the Week screen asks `POST /api/v1/ai/weekly-review`; the API returns the row in `weekly_reviews` for that ISO week when it was generated today, otherwise it generates one (subject to the person's daily AI cap) and upserts it. "Write it again" forces a regeneration. Nothing runs when nobody opens the app, so an inactive user costs nothing, and there is no second Railway service to configure or pay for. The cost is a few seconds' wait the first time each day; the screen shows everything else first and the review card fills in.
- **B. A Railway cron service** that reviews every active user's week on Sunday night and pushes a notification. Reviews are ready instantly and can drive a reminder, but it is a second service, it needs a job queue and retry logic, and it spends tokens on people who never open the result.
- **C. Both.** Cron for active users, on demand as the fallback. The right end state if notifications arrive in slice 5.

**Recommendation.** A now; add B only when local notifications exist and the owner wants "your week is ready" pushes.

**Status.** `accepted` (2026-09-26): A, confirmed by the owner.

---

## D18. Water quick-adds are log entries, not a separate table (adopted, please confirm)

**Context.** The db-schema plan left `water_entries` open: its own table, or fold into `log_entries`.

**Options.**
- **A. A "Water" log entry of N ml** whose only nutrient is `water_ml` (source `manual`, no energy). Built. The daily summary already sums `water_ml`, so the target, the bar and the weekly stats needed no new query; the day log hides water rows from the meal groups and the water card shows them as glasses with an undo. Water entries do not count toward the "unlogged day" entry count, so a day of water alone is still unlogged. Water in food and drinks (the estimator fills `water_ml`) counts toward the same target, which is what the 35 ml/kg guidance means.
- **B. A `water_entries` table** with its own routes. Cleaner separation, but the summary would have to join two tables and the export, delete-account and offline-queue work in slice 5 would each have to cover a second kind of entry.

**Recommendation.** A. Revisit only if water needs to be shown separately from food water, which would then be a display change, not a storage one.

**Status.** `accepted` (2026-09-26): A, confirmed by the owner.

---

## Smaller defaults taken without asking

- Metric by default (kg, cm, kcal); imperial toggle in Settings. kJ display can come later.
- Timezone captured automatically at onboarding, editable in Settings.
- Theme follows the system; dark is the design lead.
- Conventional commits; push straight to `main`; GitHub Actions runs typecheck, lint and tests on every push.
- Local Postgres via docker compose; tests against a real database rather than mocks.
- IDs are UUID v7 generated in the app (future offline/sync friendly).
- Local Postgres is on host port 5433 and addressed as 127.0.0.1 (5432 was taken on the owner's machine; localhost resolves to IPv6 first on Windows and Docker's IPv6 mapping hangs). Slice 1.
- Sessions: 30-day sliding expiry renewed when last seen over an hour ago; cookie `dt_session` is HMAC-signed with `SESSION_SECRET`, the database stores only the sha256 of the token. Rotating the secret signs everyone out. Slice 1.
- Rate limits are in-memory per API process (10 failed logins per email and 30 per IP in 15 minutes; 10 registrations per IP per hour). Fine for one Railway instance; move to Postgres if the API ever scales out. Slice 1.
- `GET /api/v1/me` answers 401 when signed out; the web app treats that as "signed out", not as an error. Slice 1.
- Seed accounts `finn@example.com` / `finn-password` and `tess@example.com` / `tess-password` exist for local use only; never run the seed against production. Slice 1.
- Personas used for seed data and golden tests: **Finn** (male, 28, 178 cm, 75 kg, fighter training 6x/week, lean gain) and **Tess** (female, 30, 160 cm, 50 kg, gym 3x/week, fat loss and tone).
- Onboarding answers stay in the browser (localStorage, per user id) until the last step; only the finished profile is sent, as one `PUT /api/v1/profile`. Slice 2.
- Age is computed on the server from the date of birth and the profile time zone at every save. Targets are not recomputed automatically on a birthday, only on the next profile save. Slice 2.
- Changing weight in Profile also writes a `weight_entries` row for the user's local day (one per day, later saves overwrite). Slice 2.
- The `ai_calls` table arrived in slice 2 rather than slice 3 because the first OpenAI call (the plan explanation) happens at onboarding. Slice 2.
- Enum columns (`sex`, `goal`, `activity`, ...) are plain `text` validated by zod, not Postgres enums, so adding a value is a code change without a migration. Slice 2.
- The explanation is generated the first time the targets screen opens (not during onboarding), cached on the target version, and offered again through a "write it again" button. Slice 2.
- Seed profiles are date-of-birth based (Finn 1998-06-15, Tess 1996-04-02), so their ages, and eventually one DRI band, drift with the calendar; the golden tests use ages directly and do not. Slice 2.
- Meal inference by local hour: breakfast 04:00 to 10:59, lunch 11:00 to 14:59, dinner 17:00 to 21:59, otherwise snack. The model's own `meal_hint` wins when it gives one. Slice 3.
- Entries before 04:00 local get a "Yesterday" hint and one-tap switch (the late-night rule from the plan). Any past day can be picked with a date field. Slice 3.
- The daily AI cap counts every `ai_calls` row for the person since their local midnight, all purposes and failed attempts included, so a flapping model cannot run up a bill. Slice 3.
- The estimate prompt includes up to 20 of the person's verified foods whose name or brand shares a word with the input; ids the model returns that were not offered are dropped. Slice 3.
- `max_output_tokens` is 6000 for estimates (15 items with full vectors is long); other purposes keep 1200. A zod validation failure on an otherwise well-formed answer is retried once with the error appended. Slice 3.
- A saved AI item becomes a per-serving food where one serving is exactly what was logged ("4 large eggs (200 g)"), so re-logging "1 serving" means the same plate. Manual foods and manual edits are `verified`. Slice 3.
- Deleting a library food leaves its log entries intact with their snapshot (`food_id` set to null). Deleting an entry recomputes that day's summary; a summary row with zero entries is kept rather than deleted. Slice 3.
- The region hint for portion sizes comes from the profile time zone (Europe/London is "the United Kingdom"). Slice 3.
- Today's day navigation is client-side state, not a route; opening quick add from a past day logs to that day. Slice 3.
- Editing an estimate or a logged entry: changing the quantity or the weight rescales every number from the item's original values (so passing through 0 while typing is harmless); changing one nutrient changes only that nutrient, and the corrected item becomes what later portion changes scale from. Food-group serves scale with the portion and are not edited by hand. After slice 3, 2026-09-26.
- Editing a nutrient does not flip the "Save to My foods" toggle; D14's default (confident items only) stands and the toggle is one tap away. After slice 3, 2026-09-26.
- A saved AI item keeps the brand the model returned (`log entry brand` -> `foods.brand`) so the library search and the prompt memory match "asda" next time. After slice 3, 2026-09-26.
- The web search country hint is only set for zones that map to one country (GB, IE, AU, NZ, a few US and CA cities); elsewhere the tool gets the time zone alone. After slice 3, 2026-09-26.
- The Week screen is a trailing seven-day window ending today (stepping back a week at a time), not a Monday-to-Sunday calendar week, so "days met" has a full denominator every day. The AI review is keyed by the ISO week of the window's last day. Slice 4.
- Streak: consecutive met days counted back from today when today is met, otherwise from yesterday, so an in-progress day never breaks it; an unlogged day does. The lookback is 90 days. Slice 4.
- Each past day is scored against the target version in force on that day (latest `effective_from` on or before it); Today scores live against the current version. A profile change today therefore never rewrites yesterday's verdict. Slice 4.
- Water is scored against the training-day target every day; the rest-day figure is informational. Micronutrient "completeness" is the share of minimum targets met or close and is shown as a percentage, never used to decide a day. Slice 4.
- The week's gaps come back from the API in full (the engine ranks them); the screen shows the top five. Suggestions are filtered on the server from the person's diet pattern, allergies and dislikes before the model ever sees them. Slice 4.
- Opening a day from the strip or the calendar is the route `/day/YYYY-MM-DD`, the same Today screen started on that day; the prev and next arrows stay client-side state. Slice 4.
- The router guard fetches the session and the profile in parallel and never retries a 401 on the profile, so a cold load on a slow network waits one round trip, not two. Slice 4.

## Open questions for later slices (not blocking)

- Custom domain vs Railway subdomain (slice 5).
- Email provider for password reset and reminders (slice 5).
- Photo-of-meal estimation and barcode lookup via Open Food Facts (ideas after slice 5).
