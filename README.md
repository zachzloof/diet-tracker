# diet-tracker

A free, phone-first nutrition tracker. Tell it about yourself once, get daily targets that fit your body and your goal, then log food by typing what you ate ("4 eggs and two slices of toast") or entering a meal by hand. See where you stand today, how many days you hit your targets this week, and where you're falling short.

Working name. Built for a small group of friends first, from a home-screen bookmark on their phones. The App Store comes later.

## Status

Slices 1 (foundation: monorepo, auth, PWA shell, deploy pipeline), 2 (onboarding, the nutrition engine, targets with overrides and an AI explanation, profile and target history), 3 (AI quick-add with a review card, My foods, manual entry, the day log and Today totals) and 4 (the Today dashboard with the energy ring, water, food groups and micronutrients; the Week screen with days met, streak, gaps and an AI review; the History calendar) are built. Development happens in five slices, one per working session. See [docs/PLAN.md](docs/PLAN.md) for the slices and [docs/DECISIONS.md](docs/DECISIONS.md) for the design decisions and the ones still open. [CHANGELOG.md](CHANGELOG.md) lists what shipped.

## What it does (when finished)

- **Onboarding**: sex, age, height, weight, body fat if known, activity, training, goal and pace, diet pattern, allergies, timezone, units.
- **Targets**: energy, protein, carbs, fat, fibre, sodium, saturated fat, added sugar, water, key vitamins and minerals, and food-group serves, computed deterministically from the profile and explained in plain English by AI. Every target can be overridden.
- **Logging**: type what you ate and an AI estimates the nutrients, with its assumptions shown so you can correct them. Or enter a food manually with label values and save it to your library for one-tap re-logging.
- **Today**: energy remaining, macro bars, micronutrient status, food-group serves, water.
- **Week**: days met, streaks, and an "areas you're lacking" list with concrete food suggestions that respect your diet pattern and allergies.
- **Progress**: weight trend against your goal, and target recalibration when the numbers say so.

## Stack

Vue 3 + Vite PWA, Node + Hono API, Postgres with Drizzle, OpenAI Structured Outputs, deployed as one service on Railway. Details and reasoning in [docs/DECISIONS.md](docs/DECISIONS.md).

```
apps/web         Vue 3 PWA (Vite, Tailwind v4, Pinia, TanStack Query, Reka UI)
apps/api         Hono API on Node 24, Drizzle + Postgres, serves the built SPA
packages/shared  zod schemas, the nutrient enum, the nutrition engine (pure functions)
```

## Running locally

Prerequisites: Node 24, pnpm 9 (`corepack enable` or `npm i -g pnpm@9`), Docker Desktop.

```
pnpm install
docker compose up -d db                  # Postgres on 127.0.0.1:5433
cp apps/api/.env.example apps/api/.env   # then set SESSION_SECRET (see below)
pnpm db:migrate
pnpm db:seed                             # optional: creates Finn and Tess
pnpm dev                                 # web on http://localhost:5173, API on :3000
```

Generate a session secret with:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Notes:

- The database is exposed on host port **5433** (not 5432) so it never collides with another project's Postgres. Use `127.0.0.1`, not `localhost`, in `DATABASE_URL`: on Windows `localhost` resolves to IPv6 first and Docker's IPv6 port mapping can hang instead of connecting.
- Seed accounts (local only): `finn@example.com` / `finn-password` and `tess@example.com` / `tess-password`. Both come with a profile, targets, a few library foods and a week of logged meals (relative to today), so the Week screen has something to show.
- `OPENAI_API_KEY` is optional: without it the targets screen says the explanation is unavailable and everything else works. `OPENAI_MODEL` defaults to `gpt-5.5` (decision D11: `gpt-5` needs a verified OpenAI organisation).
- `pnpm ai:smoke` sends the seven canonical food inputs ("4 eggs", ..., "asda mozzarella sticks") to the live model and prints a table of items, grams, energy, macros and confidence; `pnpm ai:smoke:plan` does the same for Finn's and Tess's plan explanations, and `pnpm ai:smoke:week` for their weekly reviews built from the seed weeks. Add `--record` to any of them to refresh the test fixtures.
- `AI_DAILY_CALL_CAP` (default 150) caps OpenAI calls per person per local day. Logging from My foods never calls OpenAI.
- `AI_WEB_SEARCH` (default `true`) lets the estimator look up a named product's label online with OpenAI's web search tool (decision D16). Each search is billed per call; `ai_calls.web_search_calls` counts them. Set `false` to switch it off without a deploy.
- To try it on your phone over Wi-Fi: `pnpm --filter @diet-tracker/web dev --host`, then open the LAN address Vite prints. Installing to the home screen needs HTTPS, so that only works on the deployed URL.

Other commands:

```
pnpm typecheck      # shared, api (tsc) and web (vue-tsc)
pnpm lint           # eslint + prettier --check
pnpm test           # vitest; api tests run against a real diet_tracker_test database
pnpm build          # shared -> api -> web
pnpm db:generate    # drizzle-kit: schema.ts -> SQL migration in apps/api/drizzle/
pnpm format
```

Tests need the database from `docker compose up -d db`; they create `diet_tracker_test` on the same server, migrate it, and truncate between files.

## Deploying to Railway

One Railway service builds the repo `Dockerfile` and serves the API and the built web app from a single origin; a Railway Postgres plugin in the same project provides the database. Push to `main` deploys. Migrations run on every boot before the server starts.

One-time setup:

1. In Railway, **New Project → Deploy from GitHub repo** and pick this repository. Railway detects `railway.json` and the `Dockerfile`.
2. In the same project, **Add → Database → PostgreSQL**. Railway injects `DATABASE_URL` into the service automatically (make sure the service's Variables tab shows it as a reference to the Postgres plugin).
3. In the service's **Variables**, add:
   - `SESSION_SECRET`: a fresh 64-character hex string (different from your local one).
   - `NODE_ENV`: `production`
   - `LOG_LEVEL`: `info`
   - `OPENAI_API_KEY`, `OPENAI_MODEL` (`gpt-5.5`, decision D11), `AI_DAILY_CALL_CAP` (`150`), `AI_WEB_SEARCH` (`true`, decision D16): the key powers the plan explanation from slice 2, food logging from slice 3 and the weekly review from slice 4.
   - `APP_ORIGIN`: set after step 4.
4. In **Settings → Networking**, generate a public domain. Copy it into `APP_ORIGIN` as `https://<domain>` with no trailing slash and redeploy. The cookie's `Secure` flag is derived from this, so it must be the real `https://` URL.
5. Watch the deploy logs for `migrations applied` and `listening`, then open `https://<domain>/api/health`. It returns `{ ok: true, version, db: "ok" }`.

On a phone: open the domain, sign up, then **Share → Add to Home Screen** (iOS) or the install prompt (Android). The app launches full-screen with its icon.

If the deploy fails, see the `railway-deploy` skill under `.claude/skills/` for the usual causes.

## Contributing

This is developed with Claude Code. `CLAUDE.md` is the project charter and `.claude/skills/` holds the project-specific working knowledge. Read both before changing anything.
