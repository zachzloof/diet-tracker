# diet-tracker (working name)

Free, phone-first nutrition tracker. A person onboards once (body, goals, training, diet), gets personalised daily targets, logs food by typing "I had 4 eggs" (AI estimates the nutrients) or by entering a meal manually, and sees where they stand today and across the week. Friends use it from a home-screen bookmark first; App Store later via Capacitor.

## Where things are
- `docs/PLAN.md` - development slices: scope, acceptance checks, status. Build one slice per session, only when asked.
- `docs/DECISIONS.md` - big design decisions with options. Anything marked `proposed` is still the owner's call; you may build on the recommended option but say so.
- `CHANGELOG.md` - what shipped per slice.
- `docs/OUTSTANDING.md` - what is deferred or waiting on a decision after slice 5; the owner revisits it after a week of real use.
- `.claude/skills/` - project skills (table below). Read the relevant one before touching its area.

## Stack (reasons in docs/DECISIONS.md)
| Layer | Choice |
|---|---|
| Repo | pnpm workspaces monorepo: `apps/web`, `apps/api`, `packages/shared` |
| Web | Vue 3 + Vite + TypeScript, PWA (vite-plugin-pwa), vue-router, Pinia, TanStack Query, Tailwind v4, Reka UI |
| API | Node 24, Hono, zod, Drizzle ORM |
| DB | Postgres on Railway. SQL migrations committed under `apps/api/drizzle/` |
| AI | OpenAI official SDK, Responses API with Structured Outputs. Model from `OPENAI_MODEL` |
| Deploy | One Railway service serving API + built SPA, plus Railway Postgres. Push to `main` deploys |
| Tests | Vitest. Golden tests for the nutrition engine. API tests against real Postgres via docker compose |

## Commands (available after slice 1)
```
pnpm install
pnpm dev            # web + api with hot reload
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm db:generate    # drizzle-kit: schema.ts -> SQL migration
pnpm db:migrate
pnpm db:seed
docker compose up -d db
```

## Non-negotiables
1. **Phone first.** Design at 390x844; must work 360 to 430 wide; thumb-reachable; safe areas respected. Desktop is just a wide phone.
2. **Nutrition math is deterministic.** All target, goal, scoring and gap math lives in `packages/shared/src/nutrition`, is pure, and is unit-tested against worked examples. AI explains and estimates; it never sets targets.
3. **AI output is validated.** Every OpenAI call uses Structured Outputs against a zod schema from `packages/shared`. Parse before persisting. Log model, tokens, latency and purpose for every call.
4. **Canonical units.** Energy kcal; macros g; minerals mg; vitamins mcg or mg exactly as the nutrient enum in `packages/shared` says. Never store mixed units.
5. **A day is the user's local day.** Log days are `YYYY-MM-DD` in `profiles.timezone`. Never derive a day from server time.
6. **Strict TypeScript, zod at every boundary** (HTTP in and out, env, AI). No `any`, no casts to escape the type system.
7. **Secrets in env only.** `.env.example` is the documented contract. Never commit `.env`.
8. **It must work.** A slice is done when its "Done when" checks in `docs/PLAN.md` pass in a phone-sized viewport, not when it compiles.

## Workflow
- One slice per session, on request. Use the `slice` skill; it carries the whole loop (frame, build, verify, docs, commit, push).
- Commit small and often with conventional commits. Push to `main` directly; no branches yet.
- **Big decisions go to the owner with options**, recorded in `docs/DECISIONS.md`: new dependency categories, schema shapes that later slices depend on, auth or AI approach changes, anything that costs money, anything the App Store will care about. Do the parts that don't depend on the answer, state your assumption for the rest, and ask at the end of the session.
- Keep `docs/PLAN.md` status and `CHANGELOG.md` current as part of every slice.

## Skills
| Skill | Use when |
|---|---|
| `slice` | Executing any slice or feature from PLAN.md |
| `nutrition-engine` | Targets, DRIs, goal math, day scoring, gap rules |
| `ai-food-estimation` | Any OpenAI call: food parsing, explanations, weekly reviews |
| `mobile-ui` | Any screen, component, style or chart in `apps/web` |
| `db-schema` | Any table, migration, seed or query |
| `railway-deploy` | Dockerfile, env vars, build/start, deploy checks |

## Conventions
- Files kebab-case; Vue components `PascalCase.vue`; composables `useThing.ts`; one feature per folder under `apps/web/src/features/`.
- API: JSON under `/api/v1`, zod-validated, errors as `{ error: { code, message, details? } }`, auth via HTTP-only session cookie.
- Dates on the wire: ISO 8601 for instants, `YYYY-MM-DD` for log days. DB columns are `timestamptz` or `date`.
- IDs: UUID v7 generated in the app.
- Nutrient amounts on a log entry always refer to the total logged quantity. On `foods` the basis (`per_100g` or `per_serving`) is explicit.

## Owner
Zach. Metric units. Wants options, not silent choices, on big things. Not watching in real time: finish the work, then report what shipped, what was assumed, and what needs a decision.
