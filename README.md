# diet-tracker

A free, phone-first nutrition tracker. Tell it about yourself once, get daily targets that fit your body and your goal, then log food by typing what you ate ("4 eggs and two slices of toast") or entering a meal by hand. See where you stand today, how many days you hit your targets this week, and where you're falling short.

Working name. Built for a small group of friends first, from a home-screen bookmark on their phones. The App Store comes later.

## Status

Planning complete, no code yet. Development happens in five slices, one per working session. See [docs/PLAN.md](docs/PLAN.md) for the slices and [docs/DECISIONS.md](docs/DECISIONS.md) for the design decisions and the ones still open.

## What it does (when finished)

- **Onboarding**: sex, age, height, weight, body fat if known, activity, training, goal and pace, diet pattern, allergies, timezone, units.
- **Targets**: energy, protein, carbs, fat, fibre, sodium, saturated fat, added sugar, water, key vitamins and minerals, and food-group serves, computed deterministically from the profile and explained in plain English by AI. Every target can be overridden.
- **Logging**: type what you ate and an AI estimates the nutrients, with its assumptions shown so you can correct them. Or enter a food manually with label values and save it to your library for one-tap re-logging.
- **Today**: energy remaining, macro bars, micronutrient status, food-group serves, water.
- **Week**: days met, streaks, and an "areas you're lacking" list with concrete food suggestions that respect your diet pattern and allergies.
- **Progress**: weight trend against your goal, and target recalibration when the numbers say so.

## Stack

Vue 3 + Vite PWA, Node + Hono API, Postgres with Drizzle, OpenAI Structured Outputs, deployed as one service on Railway. Details and reasoning in [docs/DECISIONS.md](docs/DECISIONS.md).

## Running locally

Available after slice 1. The commands will be:

```
pnpm install
docker compose up -d db
cp apps/api/.env.example apps/api/.env   # fill in OPENAI_API_KEY, SESSION_SECRET
pnpm db:migrate
pnpm dev
```

## Contributing

This is developed with Claude Code. `CLAUDE.md` is the project charter and `.claude/skills/` holds the project-specific working knowledge. Read both before changing anything.
