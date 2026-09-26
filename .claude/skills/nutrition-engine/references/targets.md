# Target formulas, defaults, floors, worked examples

All formulas are for adults 18+. Inputs: `sex` (male, female, unspecified), `age` (years), `heightCm`, `weightKg`, `bodyFatPct` (optional), `activity`, `trainingType`, `trainingDaysPerWeek`, `goal`, `pace`, `dietPattern`, `flags`.

## 1. Basal metabolic rate (BMR)

**Mifflin-St Jeor** (default):
- male: `10 * kg + 6.25 * cm - 5 * age + 5`
- female: `10 * kg + 6.25 * cm - 5 * age - 161`
- unspecified: average of the two (`10 * kg + 6.25 * cm - 5 * age - 78`)

**Katch-McArdle** when `bodyFatPct` is provided (fighters often know it): `370 + 21.6 * leanMassKg`, where `leanMassKg = kg * (1 - bodyFatPct / 100)`. The reason string names which formula was used.

## 2. Total daily energy expenditure (TDEE)

`TDEE = BMR * PAL`. The activity level covers both daily life and training; exercise calories are never added on top (double counting is the most common reason trackers overfeed people).

| activity | PAL | Helper text |
|---|---|---|
| sedentary | 1.20 | Desk job, little or no exercise |
| light | 1.375 | Light exercise 1 to 3 days a week |
| moderate | 1.55 | Moderate exercise 3 to 5 days a week |
| high | 1.725 | Hard training 6 to 7 days a week |
| very_high | 1.90 | Physical job plus daily hard training, or two sessions a day |

If the user's stated `trainingDaysPerWeek` disagrees with their chosen activity by two levels or more, keep their choice but add a reason note suggesting a review.

## 3. Goal and pace adjustment

Energy change per day from pace, using 7700 kcal per kg of body tissue (an approximation, stated in the reason):

| goal | pace options | kcal/day | default |
|---|---|---|---|
| lose | gentle 0.25 kg/wk, standard 0.5, aggressive 0.75 | -275, -550, -825 | standard |
| maintain | - | 0 | - |
| gain | lean 0.25 kg/wk, fast 0.5 | +275, +550 | lean |
| recomp | - | 0 (maintenance, high protein) | - |

Clamps, applied after the pace adjustment:
- Deficit never larger than 25% of TDEE.
- Surplus never larger than 20% of TDEE.
- **Floor**: energy never below `max(BMR, sexFloor)` where `sexFloor` is 1200 kcal (female), 1500 kcal (male), 1350 (unspecified). If the clamp or floor binds, the reason says so and suggests a gentler pace.
- Safety flags (`under18`, `pregnant`, `breastfeeding`, `edHistory`): goal forced to `maintain`, reason explains why, UI shows the professional-guidance note. `under18` is rejected at onboarding.

Round energy to the nearest 10 kcal.

## 4. Protein

Target in g/kg of **reference weight**, then grams = g/kg * referenceWeight.

Reference weight: current weight, except when BMI >= 30, then use `goalWeightKg` if given, otherwise an adjusted weight `idealKg + 0.4 * (kg - idealKg)` with `idealKg = 22 * (heightM ^ 2)`. This stops very overweight users getting absurd protein targets.

| goal | default g/kg | range |
|---|---|---|
| lose | 2.0 | 1.8 to 2.4 |
| maintain | 1.6 | 1.4 to 1.8 |
| gain | 1.8 | 1.6 to 2.2 |
| recomp | 2.2 | 2.0 to 2.4 |

Modifiers:
- `trainingType` in (combat, strength, crossfit) or `trainingDaysPerWeek >= 5`: +0.2 g/kg, capped at the range top.
- age >= 60: minimum 1.2 g/kg regardless of goal (sarcopenia prevention).
- Protein energy capped at 35% of target energy; if the cap binds, lower g/kg to fit and say so.

Round to the nearest 5 g.

## 5. Fat

Percentage of target energy, converted at 9 kcal/g, with a floor of 0.5 g/kg (hormonal health, satiety).

| dietPattern | fat % | range |
|---|---|---|
| default (omnivore, pescatarian, vegetarian, vegan, mediterranean) | 25% | 20 to 35% |
| low_carb | 40% | 35 to 50% |

If the g/kg floor binds, raise fat to the floor and take the difference from carbs. Round to the nearest 5 g.

## 6. Carbohydrates

Remainder: `(energy - protein_g * 4 - fat_g * 9) / 4`, rounded to the nearest 5 g.

Training check: if `trainingDaysPerWeek >= 5` and carbs < 3 g/kg, reduce fat toward its 20% minimum to lift carbs, and if still short add a reason note ("carbs are on the low side for your training volume; consider a gentler pace"). Never go below 50 g carbs except for the `low_carb` pattern, where the minimum is 30 g.

## 7. Fibre, sugar, saturated fat, sodium, water, alcohol

| target | kind | rule |
|---|---|---|
| fibre | minimum | `max(14 g per 1000 kcal, 25 g)`, capped at 45 g, rounded to 1 g |
| added sugar | limit | 10% of energy at 4 kcal/g (WHO); rounded to 1 g |
| total sugar | info | shown, not scored (fruit and dairy make a limit misleading) |
| saturated fat | limit | 10% of energy at 9 kcal/g |
| sodium | limit | 2300 mg; reason notes that heavy sweaters may need more |
| water | goal | `35 ml/kg + 500 ml per training hour on a training day` (assume 1 h per session), rounded to 250 ml, capped at 5000 ml |
| alcohol | limit | 0 standard drinks as the daily target; shown as a limit with 2 as the "over" line |

## 8. Micronutrients

Values per sex and age band from `nutrients.md`. All are `minimum` except sodium (limit). They are weighted lightly in scoring (see the scoring section of `nutrients.md`).

## 9. Unit conversions

kg = lb * 0.45359237; cm = in * 2.54; kcal only for now (kJ = kcal * 4.184 if a display option is added). Display rounding never feeds back into storage: store the metric value the user entered, converted once.

## 10. Recalibration (slice 5, built as `assessRecalibration`)

Due 14 days after the current target version's `effective_from`. The window is the 14 days ending today; it needs at least 10 logged days (nutrients.md section 4 "logged") and 4 weigh-ins whose first and last are at least 7 days apart. Average intake is the mean energy over the logged days. The trend is the trailing 7-day mean per weigh-in (`weightTrend`); the actual rate is `(lastTrend - firstTrend) / spanDays * 7` (`weightRate`). Expected = the pace's kg/week (0 for maintenance and recomposition).

Let `gap = actual - expected`. Within 0.15 kg/week: on track, nothing changes. Otherwise the energy adjustment is `-gap * 7700 / 7` (weight moved up more than planned means intake is above true maintenance, so energy comes down; the sign is the opposite of the TDEE error), rounded to 10 kcal and bounded to plus or minus 200 kcal per round. The adjustment is added to the current `recalibrationKcal` and the engine recomputes with the latest weigh-in as the weight input: the clamps and floor of section 3 still apply, and only the part that took effect is stored so the next round starts from the real target. Protein, fat, carbs, fibre and the limits follow the new energy through the normal rules; overrides carry over (D12). Flagged profiles (D10) and a pinned energy target are never recalibrated. The person confirms the proposal; "not now" hides it for 14 days.

Worked example (Tess, gentle loss): flat trend over 14 days at 50 kg, 12 logged days averaging 1680 kcal. gap = 0 - (-0.25) = 0.25, raw adjustment -275, bounded -200, energy 1843 - 275 - 200 = 1368 which the 25% deficit clamp lifts to 1382, rounded 1380. Stored `recalibrationKcal` is -186 (1380 - 1843 + 275 + rounding), the proposal reads 1570 -> 1380 kcal, protein stays 100 g, carbs 190 -> 155 g.

## 11. Worked examples (golden tests)

### Finn - male, 28, 178 cm, 75 kg, no body fat given, activity `high` (fighter, 6 sessions/wk), goal `gain`, pace `lean`, omnivore
- BMR = 10*75 + 6.25*178 - 5*28 + 5 = 750 + 1112.5 - 140 + 5 = **1727.5 kcal**
- TDEE = 1727.5 * 1.725 = **2979.9 kcal**
- Energy = 2979.9 + 275 = 3254.9; surplus is 9.2% (under the 20% clamp); rounded to 10 gives **3250 kcal**
- Protein = (1.8 + 0.2 combat) = 2.0 g/kg * 75 = **150 g** (600 kcal, 18.5%)
- Fat = 25% of 3250 = 812.5 kcal / 9 = 90.3, rounded **90 g** (floor 0.5*75 = 37.5 g, fine)
- Carbs = (3250 - 600 - 810) / 4 = 460, so **460 g** (6.1 g/kg; training check passes)
- Fibre = max(14 * 3.25, 25) = 45.5, capped **45 g**
- Added sugar limit = 0.10 * 3250 / 4 = **81 g**; saturated fat limit = 0.10 * 3250 / 9 = **36 g**
- Sodium **2300 mg**; water = 35*75 + 500 = 3125, rounded to 250 gives **3250 ml** on training days and 2625 rounded to **2750 ml** on rest days
- Iron 8 mg, calcium 1000 mg, magnesium 400 mg, zinc 11 mg, potassium 3400 mg, vitamin A 900 mcg, C 90 mg, D 15 mcg, B12 2.4 mcg, folate 400 mcg

### Tess - female, 30, 160 cm, 50 kg, activity `moderate` (gym 3x/wk), goal `lose`, pace `gentle`, omnivore
- BMR = 10*50 + 6.25*160 - 5*30 - 161 = 500 + 1000 - 150 - 161 = **1189 kcal**
- TDEE = 1189 * 1.55 = **1842.95 kcal**
- Energy = 1842.95 - 275 = 1567.95; deficit 14.9% (under 25%); floor is max(1189, 1200) = 1200, not binding; rounded **1570 kcal**
- Protein = 2.0 g/kg * 50 = **100 g** (400 kcal, 25.5%)
- Fat = 25% of 1570 = 392.5 kcal / 9 = 43.6, rounded **45 g** (floor 25 g, fine)
- Carbs = (1570 - 400 - 405) / 4 = 191.25, rounded **190 g** (3.8 g/kg)
- Fibre = max(14 * 1.57 = 22, 25) = **25 g**
- Added sugar limit = **39 g**; saturated fat limit = **17 g**
- Sodium **2300 mg**; water = 35*50 + 500 = 2250, so **2250 ml** on training days and 1750 ml on rest days
- Iron **18 mg**, calcium 1000 mg, magnesium 310 mg, zinc 8 mg, potassium 2600 mg, vitamin A 700 mcg, C 75 mg, D 15 mcg, B12 2.4 mcg, folate 400 mcg

### Edge cases to cover in tests
- Aggressive pace that would breach the 25% clamp or the floor: energy stops at the clamp, reason says so.
- BMI 34 user: protein uses adjusted reference weight.
- Age 65 maintain: protein at least 1.2 g/kg.
- `low_carb` pattern: fat 40%, carbs minimum 30 g.
- `pregnant` flag with goal `lose`: goal forced to maintain, note present.
- Body fat given: Katch-McArdle used and named in the reason.
- Rounding: protein, fat and carbs to 5 g, energy to 10 kcal, water to 250 ml. Rounded macros may not sum exactly to energy; the UI shows energy as the source of truth.
