---
name: slice
description: Execute one development slice of diet-tracker end to end - read its scope and "Done when" checks from docs/PLAN.md, build in the order shared -> db -> api -> ui, verify on a phone-sized viewport, update PLAN and CHANGELOG, commit and push to main, then report. Use this whenever the owner says "do slice N", "start slice N", "next slice", "build onboarding", "add food logging", or asks for any feature that maps to a PLAN.md slice, even if they never use the word slice.
---

# Slice

The app is built one slice per session so every session ends with something the owner can open on their phone. This skill is that loop. The owner is not watching in real time, so the loop ends with a report they can read cold.

## 1. Frame it (before any code)
- Read the slice in `docs/PLAN.md`: Goal, In scope, Out of scope, Done when, Decisions it depends on. Quote the "Done when" list in your first message so the owner can correct scope early.
- Read `docs/DECISIONS.md`. If the slice depends on a decision still `proposed`, don't stall: build the recommended option, say so up front, and keep the alternative cheap to switch to.
- Read the skills the slice touches: `nutrition-engine`, `ai-food-estimation`, `mobile-ui`, `db-schema`, `railway-deploy`. They hold the conventions that keep slices consistent with each other.
- Confirm the previous slice actually landed: `git log --oneline -10`, then `pnpm typecheck && pnpm test` green before adding anything. Building on a broken base wastes the session.

## 2. Build in dependency order
Shared, then DB, then API, then UI. Types and validation flow outward: if the zod schema and the pure nutrition functions exist first, the API cannot drift from them and the UI binds to real types instead of guesses.
1. `packages/shared`: zod schemas, enums, pure functions, unit tests.
2. `apps/api/src/db`: schema changes and the generated migration (`db-schema` skill).
3. `apps/api`: routes with zod validation, service functions, tests against real Postgres.
4. `apps/web`: screens, composables, API client, and every state (loading, empty, error, offline) as the `mobile-ui` skill lists them.

Commit at each boundary, not once at the end. A half-finished slice on `main` is fine because nothing is deployed to real users yet; an uncommitted evening of work is not.

## 3. Verify like a user, not a compiler
- `pnpm typecheck && pnpm lint && pnpm test` green.
- Run the app and walk the "Done when" list in a 390x844 viewport (browser device toolbar), then at 360 wide. Check dark and light.
- Anything touching AI: run the smoke script against the real model once and read the numbers (`ai-food-estimation` skill).
- Anything touching the DB: migrate from a fresh database and from the previous state. Both must work because Railway runs migrations on every boot.
- If a check cannot be done here (needs a real phone, a Railway deploy, a friend), say exactly that in the report rather than ticking it.

## 4. Close it
- `docs/PLAN.md`: set the status, tick the Done-when items you verified, list deferrals with reasons.
- `CHANGELOG.md`: a short "Slice N" section in user terms.
- `docs/DECISIONS.md`: add any decision the slice surfaced (options, recommendation, status `proposed`).
- Commit and push to `main`.

## Commit messages
Conventional commits with the package or feature as scope, one logical change per commit:
- `feat(api): session cookies with argon2id hashing`
- `feat(web): onboarding steps 1-4`
- `feat(shared): computeTargets with golden tests`
- `chore(deploy): railway healthcheck and migrate-on-boot`
- `docs(plan): slice 2 done`

## When you hit a fork
Big (new dependency category, a schema shape later slices depend on, auth or AI approach, money, App Store rules): write the options to `DECISIONS.md`, build the recommended one to keep moving, flag it in the report. Small: take the conventional option and mention it in one line. Never leave a fork unmentioned; the owner wants to know what was chosen for them.

## Report (final message, written for the owner who did not watch)
1. **Shipped** - what they can now do, in user terms, with the URL or route to try.
2. **Verified** - which Done-when items passed and how.
3. **Not done or deferred** - each with a reason.
4. **Assumptions** - decisions taken provisionally.
5. **Needs your call** - options with a one-paragraph recommendation each.
Keep code out of the report unless they must run it.
