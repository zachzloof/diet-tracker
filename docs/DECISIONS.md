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

## Smaller defaults taken without asking

- Metric by default (kg, cm, kcal); imperial toggle in Settings. kJ display can come later.
- Timezone captured automatically at onboarding, editable in Settings.
- Theme follows the system; dark is the design lead.
- Conventional commits; push straight to `main`; GitHub Actions runs typecheck, lint and tests on every push.
- Local Postgres via docker compose; tests against a real database rather than mocks.
- IDs are UUID v7 generated in the app (future offline/sync friendly).
- Personas used for seed data and golden tests: **Finn** (male, 28, 178 cm, 75 kg, fighter training 6x/week, lean gain) and **Tess** (female, 30, 160 cm, 50 kg, gym 3x/week, fat loss and tone).

## Open questions for later slices (not blocking)

- Custom domain vs Railway subdomain (slice 5).
- Scheduled jobs for weekly AI reviews: Railway cron service vs on-demand generation when the user opens the Week screen (slice 4; recommendation is on-demand and cached, because it needs no extra service).
- Email provider for password reset and reminders (slice 5).
- Photo-of-meal estimation and barcode lookup via Open Food Facts (ideas after slice 5).
