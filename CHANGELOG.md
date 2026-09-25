# Changelog

All user-visible changes, grouped by slice. Newest first.

## Unreleased

### Slice 1 - Foundation: monorepo, auth, deploy (2026-09-25)
- You can create an account, sign in, stay signed in across refreshes and redeploys, and sign out. Wrong passwords get a clear message; ten failed attempts on one account lock it for 15 minutes.
- Installable phone app shell: Today, Log (+), Week and You tabs, a bottom sheet for quick add, dark and light themes with a manual override, offline banner, iOS add-to-home-screen hint and Android install prompt.
- Placeholders on Today, Week and You that say what arrives in the next slices.
- Local development: docker compose Postgres, `.env.example`, migrations, seed accounts for Finn and Tess, tests against a real database, CI on every push.
- Deploy: multi-stage Dockerfile, `railway.json` healthcheck, migrations on boot, README steps for creating the Railway project.

### Planning (2026-09-25)
- Project charter in `CLAUDE.md`, slice plan in `docs/PLAN.md`, decision log in `docs/DECISIONS.md` (D1 to D10 accepted by the owner).
- Project skills: `slice`, `nutrition-engine`, `ai-food-estimation`, `mobile-ui`, `db-schema`, `railway-deploy`.
- No application code yet.
