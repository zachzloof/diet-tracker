---
name: db-schema
description: Drizzle ORM + Postgres conventions for diet-tracker - table and column naming, UUID v7 ids, timestamps, per-user scoping with cascade delete, the JSONB nutrient vector, versioned targets, user-local day columns, the migration workflow (edit schema, generate, read the SQL, migrate twice, commit), seeds, and local Postgres via docker compose. Use whenever adding or changing tables, columns, indexes, migrations, seeds or queries in apps/api/src/db, and whenever a query needs daily totals or "this week".
---

# DB schema

## Principles and why
- **Migrations are code.** `pnpm db:generate` writes SQL into `apps/api/drizzle/`. Read that SQL before committing: the generator sometimes drops and recreates where you expected an alter, which would destroy data in production. Never edit a migration that has run anywhere; add a new one.
- **Every user-owned row has `user_id`** with `ON DELETE CASCADE`, so deleting an account is one `DELETE FROM users` and the App Store's account-deletion rule is satisfied by construction. Index `(user_id, <the date or time you query by>)`.
- **Snapshot at log time.** A `log_entries` row stores the nutrient vector it had when logged. Editing a food in the library later must not rewrite history, or "days met" changes retroactively and people stop trusting it.
- **Nutrients are one JSONB vector** keyed by the `NutrientKey` enum from `packages/shared` (see `nutrition-engine/references/nutrients.md`). Adding a nutrient is an enum change plus a backfill, not a wide-table migration across three tables. Validate with zod on every write so the JSONB never holds a stray key or a string.
- **Days are user-local.** `log_entries.day` is a `date` column holding the user's local calendar date, set by the API from `profiles.timezone` and the entry's `logged_at`. All "today" and "this week" queries filter on `day`, never on `logged_at::date`, or a friend in another timezone gets the wrong day.
- **Boot-safe migrations.** Railway runs migrations before starting the new container while the old one still serves. Add columns nullable or with defaults first; drop or rename in a later slice.

## Planned tables (slices add them; keep this table current)
| Table | Slice | Notes |
|---|---|---|
| users | 1 | id, email (citext, unique), password_hash, created_at, updated_at |
| sessions | 1 | id (sha256 of the cookie token), user_id, expires_at, last_seen_at, user_agent |
| profiles | 2 | 1:1 with users. sex, dob, height_cm, weight_kg, body_fat_pct?, activity, training_type, training_days, goal, goal_weight_kg?, pace, diet_pattern, allergies[], dislikes[], timezone, units, flags jsonb |
| target_versions | 2 | user_id, effective_from (date), inputs jsonb, computed jsonb, overrides jsonb, explanation jsonb?, created_at. Latest effective row wins; older rows are history |
| weight_entries | 2 | user_id, day, weight_kg, note?; unique (user_id, day) |
| foods | 3 | user_id? (null = shared), name, brand?, basis ('per_100g' or 'per_serving'), serving_grams?, serving_label?, nutrients jsonb, food_groups jsonb, source ('manual' or 'ai' or 'usda'), verified bool, last_used_at |
| log_entries | 3 | user_id, day, logged_at, meal, name, quantity, unit, grams, nutrients jsonb, food_groups jsonb, source, food_id?, ai_call_id?, assumptions text[], confidence |
| daily_summaries | 3 | user_id, day, totals jsonb, food_groups jsonb, entry_count, updated_at; unique (user_id, day). Rewritten inside the same transaction as any log write |
| ai_calls | 3 | user_id, purpose, model, input_tokens, output_tokens, latency_ms, ok, error?, created_at |
| water_entries | 4 | user_id, day, ml, logged_at (or fold into log_entries; decide in slice 4) |

## Workflow
1. Edit the schema under `apps/api/src/db/schema/` (one file per table group, re-exported from `index.ts`).
2. `pnpm db:generate`, then open the new SQL file and read it.
3. `pnpm db:migrate` against the local database. Run it from a fresh database and from the previous state; Railway will do the latter on deploy.
4. Update `apps/api/src/db/seed.ts` if the demo users (Finn, Tess) are affected.
5. Commit the schema and the migration in the same commit.

## Local database
`docker compose up -d db` gives Postgres 17 on **127.0.0.1:5433** (host port 5433 so it never collides with another project on 5432), database `diet_tracker`, user and password `postgres`. `DATABASE_URL` in `apps/api/.env` points at it. Use `127.0.0.1` rather than `localhost`: on Windows, `localhost` resolves to IPv6 first and Docker's IPv6 mapping can hang instead of refusing. The pool has a 10 s connection timeout so a wrong host fails fast. Tests use `diet_tracker_test`, created and migrated by `apps/api/src/test/global-setup.ts` and truncated between test files, so tests exercise real SQL and real constraints instead of mocks.

Migrations: `pnpm db:migrate` runs `apps/api/src/migrate.ts`, the same runner the Docker image executes before the server (`dist/migrate.js`). It logs how many files it applied. The first migration also creates the `citext` extension.

## Query conventions
- Daily totals come from `daily_summaries`, never from summing `log_entries` at read time on hot paths. Recompute the summary row in the same transaction as any insert, update or delete on `log_entries` for that user and day.
- "Days met this week" reads seven `daily_summaries` rows plus the `target_versions` row effective on each day. The comparison is the pure `evaluateDay` function in `packages/shared`, so API and UI agree.
- Prefer Drizzle's query builder for CRUD; use the `sql` template for JSONB aggregation and `date` arithmetic. Keep raw SQL in the repository layer, not in route handlers.
