---
name: nutrition-engine
description: Domain rules for all nutrition math in diet-tracker - BMR/TDEE, goal-based calorie and macro targets (protein g/kg by goal, fat % with a g/kg floor, carbs as remainder), fibre, sodium, saturated fat, added sugar, water, micronutrient DRIs by sex and age, food-group serves, safety floors and flags, unit conversions, day scoring ("day met") and the "areas you're lacking" gap rules. Read this before writing or changing anything in packages/shared/src/nutrition, onboarding target calculation, target overrides, recalibration, weekly insights, gap detection, or any prompt that mentions targets, and whenever g/kg, kcal, RDA, DRI, or serves come up.
---

# Nutrition engine

## Why it exists
Two people at the same weight need very different targets: a 75 kg fighter in a lean gain and a 50 kg woman cutting share almost nothing except the formula. The engine turns onboarding answers into targets a sports dietitian would recognise as sensible defaults, and it does so deterministically so the numbers are testable, explainable, and identical every time for the same inputs. The AI's job is to explain and estimate; it never invents targets.

## Shape (`packages/shared/src/nutrition`)
- `computeTargets(profile): Targets` - pure. Inputs: sex, age, height, weight, body fat (optional), activity, training type and days, goal, pace, diet pattern, safety flags. Output: one entry per target with `kind`, `value`, `unit`, `range`, and a one-line `reason`.
- `evaluateDay({ totals, foodGroups, entryCount }, targets): DayScore` - pure (`scoring.ts`). A `TargetScore` per target (`actual`, `target`, `ratio`, status `met`, `close`, `short`, `over` or `unscored`), plus `logged`, `dayMet` and `completeness`. `scoreTarget` scores one target for a live bar.
- `findGaps(days: DayScore[], { dietPattern, allergies, dislikes }): Gap[]` - pure (`gaps.ts`). The rules behind "areas where you're lacking", ranked by severity, distance from target, then key; each gap carries `evidence` (the sentence the weekly review quotes) and up to three suggestions from `gap-suggestions.ts`, filtered by diet pattern, allergens and dislikes.
- `week.ts`: `weekWindow`, `currentStreak`, `summariseTarget` (days met, statuses per day, averages) and `summariseWeek`, shared by the Week screen and the review prompt.
- `references/targets.md` - formulas, defaults, ranges, floors, and two worked examples (Finn, Tess) that are the golden tests. Read it before touching `computeTargets` or recalibration.
- `references/nutrients.md` - the `NutrientKey` enum with units, DRIs by sex and age, food-group serve definitions, scoring thresholds and gap rules. Read it before touching schemas, `evaluateDay`, `findGaps`, or any prompt that defines serves.

## Rules that must survive every refactor
1. **Pure and deterministic.** No `Date.now()`, no randomness, no I/O inside the engine. Age is an input, computed by the caller from `dob` and the user's local today.
2. **Every number carries a reason.** `{ value: 150, unit: 'g', reason: '2.0 g/kg for lean gain with fighter training' }`. The targets screen and the AI explanation prompt both read these, so nobody has to reverse-engineer a number.
3. **Ranges first, then a default inside the range.** Protein for fat loss is 1.8 to 2.4 g/kg with 2.0 as default. Overrides inside the range are accepted silently; outside the range they are accepted with a warning; below a safety floor they are refused unless the user explicitly confirms.
4. **Safety flags come before everything.** Under 18: not supported. Pregnant, breastfeeding, or self-reported eating-disorder history: no deficit, maintenance targets, and a "please work with a professional" note. Energy never below the floor without an explicit, warned override. These are conservative on purpose: the app is not a clinician.
5. **Kinds are not interchangeable.** `goal` (energy, macros) has a tolerance band. `minimum` (fibre, potassium, vegetables) is met at or above target. `limit` (sodium, saturated fat, added sugar, alcohol) is met at or below. `info` is displayed but never scored. A day at 85% protein and 130% fibre is "close", not failed; a day with sodium at 180% is "over" even if everything else is perfect.
6. **Micronutrients are weighted lightly.** AI estimates of vitamins and minerals are rough, so they contribute to a separate "nutrient completeness" score and never decide `dayMet` on their own. Otherwise people fail days for reasons they cannot see or control.
7. **One implementation, two callers.** The same `evaluateDay` runs server-side (daily summaries, weekly stats) and client-side (live Today screen). If they ever disagree, the shared function is wrong, not a caller.

## Working with the AI on targets
The AI receives the computed targets with their reasons plus the profile, and writes the explanation. It may propose adjustments only as suggestions the user accepts, which then pass through the same override validation as a manual edit. It never receives an instruction like "set this user's protein".

## Adding a nutrient or rule
Add the key and unit to `nutrients.md` and the enum; give it a `kind` and a cited DRI source; add it to the AI estimation schema (`ai-food-estimation` skill); backfill existing rows with 0 and `confidence: low`; add a golden-test expectation. Say in the commit where the value came from.
