---
name: railway-deploy
description: How diet-tracker builds and runs on Railway - one service serving the Hono API and the built Vue SPA from a Dockerfile, a Railway Postgres plugin, migrations on boot, the env var contract, the health check, and how to verify or debug a deploy. Use whenever touching the Dockerfile, railway.json, build or start scripts, env vars, or when the owner says "is it live", "deploy this", "prod is broken", or wants a URL to try on their phone.
---

# Railway deploy

## Shape
- **One service** built from the repo `Dockerfile`. It runs `node apps/api/dist/index.js`, which serves `/api/*` and, for any other path, the built SPA from `apps/web/dist` with a fallback to `index.html`. One origin means no CORS, cookies just work, and Railway's HTTPS makes the PWA installable (browsers refuse to install over HTTP).
- **Postgres** is a Railway plugin in the same project; Railway injects `DATABASE_URL`.
- **Deploys from GitHub `main`** on every push. The Dockerfile is explicit so Railway never has to guess the build.

## Boot sequence
Start command: `node apps/api/dist/migrate.js && node apps/api/dist/index.js`.
Migrations run before the server on every deploy so schema and code cannot disagree. That is why migrations must be safe to run twice and backwards-compatible for the short overlap while the old container drains (see the `db-schema` skill).

## Env var contract (`apps/api/.env.example` is the source of truth)
| Var | Purpose |
|---|---|
| DATABASE_URL | Injected by Railway; locally points at docker compose |
| SESSION_SECRET | 32+ random bytes; signs session cookies |
| APP_ORIGIN | e.g. `https://diet-tracker-production.up.railway.app`; cookie settings and absolute links |
| OPENAI_API_KEY | server-only; must never reach the web bundle |
| OPENAI_MODEL | e.g. `gpt-5`; changing it needs no code change |
| AI_DAILY_CALL_CAP | per-user daily OpenAI call cap; default 150 |
| NODE_ENV / LOG_LEVEL | `production` / `info` |

Env is parsed by zod at boot (`apps/api/src/env.ts`). A missing or malformed var fails fast with its name in the message, which is far easier to diagnose than a 500 an hour later.

## Health
`GET /api/health` returns `{ ok: true, version, db: "ok" }` and `railway.json` points its healthcheck at it. If the DB ping fails, return 503 so Railway keeps the previous deployment serving.

## Verifying a deploy
1. Railway dashboard, deploy logs: build finished, migrations printed how many applied, server printed "listening".
2. `curl https://<domain>/api/health`.
3. On a phone: open the URL, add to home screen, log in, walk the slice's Done-when list.
The Railway CLI is not installed on the owner's machine. Use the dashboard, or `npm i -g @railway/cli` if terminal log access becomes necessary; say so in the report if you install it.

## Common failures
- Build OK, boot crashes with an env error: set the variable in Railway Variables and redeploy.
- Migration fails: the deploy is held and the old one keeps serving. Fix forward with a new migration; never edit the failed one.
- Cookie not set on phone: `APP_ORIGIN` mismatch, or the cookie is missing `Secure; HttpOnly; SameSite=Lax`.
- 404 on refreshing a deep link: the SPA fallback is missing from the static handler.
- PWA will not install: manifest missing, icons missing, or service worker not registered on the deployed origin.

## Still open (docs/DECISIONS.md)
Custom domain, a staging environment, and whether weekly AI reviews need a scheduled job or are generated on demand.
