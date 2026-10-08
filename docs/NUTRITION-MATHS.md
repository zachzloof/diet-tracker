# The maths behind Minori

Every number the app shows a person comes from the rules on this page. Nothing here is set by the AI: it estimates what was eaten and explains the targets, and that is all. The code is `packages/shared/src/nutrition`, it is pure, and every rule below has a unit test (Finn and Tess, section 11, are the golden examples).

**This page must change in the same commit as the engine.** If a band, a formula, a reference value, a rule or a constant on this page changes in code, update it here, say which decision (D-number in `docs/DECISIONS.md`) made the change, and add a line to the change log at the bottom.

Last updated 2026-10-08 (D34).

---

## 1. Targets

### 1.1 Basal metabolic rate (BMR)

Mifflin-St Jeor by default:

| sex | formula |
|---|---|
| male | `10 × kg + 6.25 × cm − 5 × age + 5` |
| female | `10 × kg + 6.25 × cm − 5 × age − 161` |
| unspecified | average of the two: `10 × kg + 6.25 × cm − 5 × age − 78` |

If body fat % is given, Katch-McArdle is used instead and named in the reason: `370 + 21.6 × leanKg`, where `leanKg = kg × (1 − bodyFat / 100)`.

### 1.2 Maintenance energy (TDEE)

`TDEE = BMR × activity multiplier`. The multiplier covers daily life and training together; exercise calories are never added on top.

| activity | multiplier | meaning |
|---|---|---|
| sedentary | 1.20 | desk job, little or no exercise |
| light | 1.375 | light exercise 1 to 3 days a week |
| moderate | 1.55 | moderate exercise 3 to 5 days a week |
| high | 1.725 | hard training 6 to 7 days a week |
| very high | 1.90 | physical job plus daily hard training, or two sessions a day |

If training days per week disagree with the chosen level by two steps or more, the choice stands but the reason suggests a review.

### 1.3 Energy target: goal and pace

7700 kcal per kg of body tissue (an approximation, stated in the reason).

| goal | paces | kcal per day | default pace |
|---|---|---|---|
| lose | gentle 0.25 kg/wk, standard 0.5, aggressive 0.75 | −275, −550, −825 | standard |
| maintain | none | 0 | |
| gain | lean 0.25 kg/wk, fast 0.5 | +275, +550 | lean |
| recomp | none | 0 (maintenance, high protein) | |

Then, in order:
1. A confirmed recalibration adjustment (section 9) is added.
2. Deficit clamped to at most 25% of TDEE; surplus to at most 20%.
3. Floor: never below `max(BMR, sex floor)`, with sex floors 1200 kcal (female), 1500 (male), 1350 (unspecified). If a clamp or the floor binds, the reason says so.
4. Rounded to the nearest 10 kcal.

Safety flags (pregnant, breastfeeding, eating-disorder history) force the goal to maintain and add a "work with a professional" note. Under 18 is not supported.

### 1.4 Protein

Grams = g/kg × reference weight, rounded to 5 g.

Reference weight is current weight, except at BMI 30 or more, where it is the goal weight if given, otherwise `idealKg + 0.4 × (kg − idealKg)` with `idealKg = 22 × height(m)²`.

| goal | default g/kg | range |
|---|---|---|
| lose | 2.0 | 1.8 to 2.4 |
| maintain | 1.6 | 1.4 to 1.8 |
| gain | 1.8 | 1.6 to 2.2 |
| recomp | 2.2 | 2.0 to 2.4 |

Modifiers: combat, strength or crossfit training, or 5+ training days, add 0.2 g/kg (capped at the range top). Age 60+ never goes below 1.2 g/kg. Protein is capped at 35% of energy; if that binds, g/kg is lowered to fit and the reason says so.

### 1.5 Fat

A share of energy at 9 kcal/g, rounded to 5 g, with a floor of 0.5 g/kg.

| diet pattern | fat % | range |
|---|---|---|
| all except low carb | 25% | 20 to 35% |
| low carb | 40% | 35 to 50% |

If the g/kg floor binds, fat rises to the floor and carbs give up the difference.

### 1.6 Carbohydrates

The remainder: `(energy − protein × 4 − fat × 9) / 4`, rounded to 5 g. With 5+ training days and carbs under 3 g/kg, fat is lowered toward its 20% minimum to lift carbs, and if carbs are still low the reason says so. Never below 50 g (30 g on low carb).

### 1.7 Fibre, sugars, saturated fat, sodium, water

| target | kind | rule |
|---|---|---|
| fibre | minimum | `max(14 g per 1000 kcal, 25 g)`, capped at 45 g, rounded to 1 g |
| added sugar | limit | 10% of energy at 4 kcal/g (WHO), rounded to 1 g |
| total sugar | info | shown, never scored (fruit and dairy make a limit misleading) |
| saturated fat | limit | 10% of energy at 9 kcal/g |
| sodium | limit | 2300 mg |
| water | goal | `35 ml/kg + 500 ml per training hour on a training day` (1 hour per session assumed), rounded to 250 ml, capped at 5000 ml |
| alcohol | hidden | Logged and stored on every entry, but no target, no score, not shown anywhere (D34). The old rule (0 drinks, over above 2) is kept in code behind `HIDDEN_NUTRIENT_KEYS` so it can come back. |

### 1.8 Vitamins, minerals and omega-3

Daily targets are the adult RDA, or the Adequate Intake (AI) where no RDA exists, from the US NIH Office of Dietary Supplements. Sex "unspecified" takes the higher of the two.

| nutrient | male 19-30 | 31-50 | 51-70 | 71+ | female 19-30 | 31-50 | 51-70 | 71+ |
|---|---|---|---|---|---|---|---|---|
| potassium mg (AI) | 3400 | 3400 | 3400 | 3400 | 2600 | 2600 | 2600 | 2600 |
| calcium mg | 1000 | 1000 | 1000 | 1200 | 1000 | 1000 | 1200 | 1200 |
| iron mg | 8 | 8 | 8 | 8 | 18 | 18 | 8 | 8 |
| magnesium mg | 400 | 420 | 420 | 420 | 310 | 320 | 320 | 320 |
| zinc mg | 11 | 11 | 11 | 11 | 8 | 8 | 8 | 8 |
| iodine mcg | 150 | 150 | 150 | 150 | 150 | 150 | 150 | 150 |
| vitamin A mcg RAE | 900 | 900 | 900 | 900 | 700 | 700 | 700 | 700 |
| vitamin C mg | 90 | 90 | 90 | 90 | 75 | 75 | 75 | 75 |
| vitamin D mcg | 15 | 15 | 15 | 20 | 15 | 15 | 15 | 20 |
| vitamin B12 mcg | 2.4 | 2.4 | 2.4 | 2.4 | 2.4 | 2.4 | 2.4 | 2.4 |
| folate mcg DFE | 400 | 400 | 400 | 400 | 400 | 400 | 400 | 400 |
| vitamin E mg | 15 | 15 | 15 | 15 | 15 | 15 | 15 | 15 |
| vitamin K mcg (AI) | 120 | 120 | 120 | 120 | 90 | 90 | 90 | 90 |
| omega-3 g (AI, for ALA) | 1.6 | 1.6 | 1.6 | 1.6 | 1.1 | 1.1 | 1.1 | 1.1 |

Omega-3 is logged as total ALA + EPA + DHA against the ALA value, because EPA + DHA have no reference value. Iodine estimates depend on iodised salt and local bread and dairy, so the app calls them rough.

### 1.9 Upper limits (when a vitamin or mineral turns red)

A minimum nutrient only ever scores "over" at or above its tolerable upper intake level (UL), from the same NIH tables. Only ULs that apply to total intake from food are enforced.

| nutrient | UL 19-50 | UL 51+ | note |
|---|---|---|---|
| calcium mg | 2500 | 2000 | |
| iron mg | 45 | 45 | |
| zinc mg | 40 | 40 | |
| iodine mcg | 1100 | 1100 | |
| vitamin A mcg | 3000 | 3000 | the UL is for preformed vitamin A (retinol) and the estimate is in RAE, so a very carrot-heavy day can trip it; left in on purpose |
| vitamin C mg | 2000 | 2000 | |
| vitamin D mcg | 100 | 100 | |
| vitamin E mg | 1000 | 1000 | unreachable from food; listed for completeness |

Never red, however much: potassium, magnesium (its 350 mg UL is for supplements only), vitamin B12, folate (its 1000 mcg UL is for folic acid only), vitamin K, omega-3.

### 1.10 Food-group serves

Serve sizes follow the Australian Dietary Guidelines. The AI estimation prompt quotes these definitions word for word.

| group | one serve | daily target | kind |
|---|---|---|---|
| vegetables | 75 g cooked vegetables or legumes, 1 cup salad, or half a medium potato | 5 (female), 6 (male) | minimum |
| fruit | 150 g fresh fruit, 1 medium piece, or 30 g dried | 2 | minimum |
| whole grains | 1 slice wholegrain bread, half a cup cooked wholegrain rice, pasta or oats, 30 g wholegrain cereal | 4 (female), 6 (male); 3 on low carb | minimum |
| protein foods | 65 g cooked lean meat, 80 g cooked poultry, 100 g cooked fish, 2 large eggs, 150 g cooked legumes or tofu, 30 g nuts or seeds | 2.5 (female), 3 (male) | minimum |
| dairy or alternatives | 250 ml milk or fortified plant milk, 200 g yoghurt, 40 g hard cheese | 2.5; 3.5 for female 51+, 4 for female 71+ | minimum |
| legumes | 150 g cooked (also counts toward protein foods and vegetables) | info only | info |
| nuts and seeds | 30 g | info only | info |

### 1.11 Overrides

A person can change any target. Inside the target's range the change is accepted silently. Outside the range it is accepted with a warning. Below a safety floor (energy, protein, fat, carbs, water) it is refused unless explicitly confirmed. Overrides carry over when targets are recomputed, unless the new computed target would block them.

---

## 2. Scoring a day

Every target is scored as `ratio = eaten / target`, then given a status: **met**, **close**, **short**, **over**, or **unscored**. Boundary values count as inside the band (a day at exactly 95% is met). Protein, carbs and fat deliberately keep wider bands than the rest (D34).

| target | met | close | short | over (red) |
|---|---|---|---|---|
| energy | 95 to 105% | 90 to 95% and 105 to 110% | under 90% | over 110% |
| water | 95% and up | 90 to 95% | under 90% | never; the water card shows a caution in words at 4 litres or more (`WATER_CAUTION_ML`) |
| protein | 90% and up | 75 to 90% | under 75% | never |
| carbs, fat | 80 to 120% | 65 to 80% and 120 to 135% | under 65% | over 135% |
| minimums: fibre, every vitamin and mineral, omega-3, food groups | 95% and up | 90 to 95% | under 90% | only at or above the upper limit in 1.9; nutrients without one never go red |
| limits: sodium, saturated fat, added sugar | up to the limit (100%) | over the limit, up to 105% | not applicable | over 105% |
| info (total sugar, legumes, nuts and seeds) | unscored | | | |
| hidden (alcohol) | unscored, not shown | | | |

### 2.1 Is the day logged?

A day with fewer than 2 food entries **and** under 40% of the energy target is "not logged" rather than "short", so forgotten days do not pollute the stats. Water quick-adds do not count as entries. Not-logged days are left out of averages and gap rules, but they break a streak.

### 2.2 "Day met"

The verdict follows the goal the targets were built for (D31). Energy must be met or close (within 10%) for everyone. Then:

| goal | protein must be | limits that fail the day when over (past 105%) |
|---|---|---|
| gain, recomp | met (90%+) | none; limits are shown but never decide the day |
| lose | met (90%+) | added sugar only |
| maintain | met or close (75%+) | sodium, saturated fat, added sugar |

A not-logged day is never met. A profile with a safety flag is judged by the maintain rule, because its targets were built as maintain.

### 2.3 Completeness

The share of minimum targets (fibre, the 14 vitamins, minerals and omega-3, the 5 scored food groups) that are met or close. Shown as a secondary score and used by gap detection. It never changes the day verdict, because AI estimates of micronutrients are rough.

---

## 3. The week

- The window is the seven calendar days ending on the chosen day, in the person's local timezone.
- **Streak**: consecutive met days ending today, or ending yesterday when today is not yet met, so a streak survives until the day is actually over. A not-logged day breaks it.
- Per target: days met (met status only), one status per day, average of logged days and that average as a ratio of the target.

---

## 4. Gaps ("areas where you're lacking")

Over the last 7 days, logged days only. Fewer than 4 logged days gives one gap, "log a few more days". Rules:

| rule | triggers when | severity |
|---|---|---|
| energy off plan | average energy ratio outside 85 to 115% (direction noted) | high |
| protein short | protein short or close on 3+ logged days | high |
| limit over (sodium, saturated fat, added sugar) | over on 3+ logged days | medium |
| fibre short | under 75% on 4+ logged days | medium |
| food group short (vegetables, fruit, whole grains, dairy or alternatives, protein foods) | under 60% on 4+ logged days | medium |
| micronutrient short (each minimum vitamin, mineral, omega-3) | under 70% on 5+ logged days | low |
| water short | under 70% on 4+ logged days | low |
| logging gaps | 3+ not-logged days | low |

Ranking: severity, then distance from target, then name. The Week screen shows the top five. Each gap has up to three food suggestions from a fixed list, filtered by diet pattern, allergies and dislikes; the weekly review may reword them but never invents numbers.

---

## 5. Weight trend

Body weight swings day to day, so nothing reads a single weigh-in. The trend is a trailing 7-day mean per weigh-in. The rate is `(last trend − first trend) / days between × 7`, in kg per week, and is null under 7 days of span.

---

## 6. Recalibration

Due 14 days after the current targets took effect. The 14 days ending today must have at least 10 logged days and 4 weigh-ins spanning at least 7 days.

- Expected rate = the pace's kg/week (0 for maintain and recomp). Actual rate = section 5.
- `gap = actual − expected`. Within 0.15 kg/week: on track, nothing changes.
- Otherwise the energy adjustment is `−gap × 7700 / 7`, rounded to 10 kcal, bounded to ±200 kcal per round. Weight moving up faster than planned means intake is above true maintenance, so energy comes down.
- The adjustment is added to any earlier adjustment and the targets are recomputed with the latest weigh-in as the weight (clamps and floor from 1.3 still apply; only the part that took effect is stored). Protein, fat, carbs, fibre and the limits follow the new energy through the normal rules; overrides carry over.
- Flagged profiles and a pinned energy override are never recalibrated. The person confirms the proposal; "not now" hides it for 14 days.

---

## 7. Units and rounding

Stored metric only: kcal, g, mg, mcg, ml. kg = lb × 0.45359237; cm = in × 2.54. Energy rounds to 10 kcal, macros to 5 g, fibre and limits to 1 g, water to 250 ml. Rounded macros may not sum exactly to energy; energy is the source of truth. Display rounding never feeds back into storage, which is why a nutrient can show "1.6 / 1.6" while the true total is 1.55; the 95% met line exists so that still reads met.

A log entry's nutrients are always the totals for the quantity logged. Every vector carries all 25 nutrient keys; unknown means 0 with low confidence, never a missing key.

---

## 8. What the AI does and does not do

- Estimates the nutrients, grams and food-group serves of what a person types, against a strict schema, with portion defaults quoted from this page.
- Explains the computed targets in prose, from the reasons the engine wrote.
- Writes the weekly review from the stats and gaps above, and is told the goal's day-met rule in words so it never blames a limit the rule ignores.
- Never sets, nudges or scores a target.

---

## 9. Where each rule lives

| rule | file in `packages/shared/src/nutrition` |
|---|---|
| sections 1.1 to 1.7, 1.11 | `targets.ts` (`computeTargets`, `checkOverride`) |
| 1.8, 1.9, 1.10 | `dri.ts` (`DRI`, `UPPER_LIMIT`, `foodGroupServesFor`) |
| 2 | `scoring.ts` (`scoreTarget`, `evaluateDay`, `dayMetRule`, `WATER_CAUTION_ML`) |
| 3 | `week.ts` |
| 4 | `gaps.ts`, `gap-suggestions.ts` |
| 5 | `weight.ts` |
| 6 | `recalibration.ts` |
| hidden nutrients | `nutrients.ts` (`HIDDEN_NUTRIENT_KEYS`) |

The engine references the code was built from, with the worked examples, are `.claude/skills/nutrition-engine/references/targets.md` and `nutrients.md`.

---

## 10. Worked examples

**Finn**: male, 28, 178 cm, 75 kg, high activity (fighter, 6 sessions a week), gain, lean pace, omnivore.
BMR 1727.5. TDEE 2979.9. Energy 2979.9 + 275 = 3254.9, rounded 3250 kcal. Protein (1.8 + 0.2 combat) × 75 = 150 g. Fat 25% = 90 g. Carbs (3250 − 600 − 810) / 4 = 460 g. Fibre 45 g (capped). Added sugar 81 g, saturated fat 36 g, sodium 2300 mg. Water 35 × 75 + 500 = 3125, rounded 3250 ml on training days.

**Tess**: female, 30, 160 cm, 50 kg, moderate activity, lose, gentle pace, omnivore.
BMR 1189. TDEE 1843. Energy 1843 − 275 = 1568, rounded 1570 kcal (deficit 14.9%, floor 1200 not binding). Protein 2.0 × 50 = 100 g. Fat 45 g. Carbs 190 g. Fibre 25 g. Added sugar 39 g, saturated fat 17 g. Water 2250 ml on training days. Iron 18 mg.

---

## Change log for this page

- 2026-10-08 (D34 follow-up): limits now read met only up to the limit itself, close from there to 105%, over past 105% (was met to 105%, close to 110%). A deciding limit fails the day past 105%.
- 2026-10-08 (D34): page created. Energy met within 5%, close within 10%; water met from 95%, never over, caution at 4 litres; minimums met from 95%, red only at the UL; limits met to 105%, close to 110%; alcohol hidden. Upper-limit table added.
