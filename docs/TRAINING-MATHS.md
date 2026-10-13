# Training maths

The owner-facing picture of every number the gym side computes. Everything here lives in
`packages/shared/src/training` as pure functions with unit tests, the same rule as
`docs/NUTRITION-MATHS.md`: **a change to a rule in the code updates this page in the same commit**,
and the change log at the bottom says what moved. The AI never computes any of it; when it
narrates training (slice 10), it is handed these numbers.

## What is stored

A session (`workout`) belongs to one user-local day and has a start, an optional finish, a
title, notes and a 1 to 5 "feel". It holds exercise blocks in order; each block points at an
exercise in the catalogue (or one of your own) and holds sets in order. A set records, in
canonical units, whichever of these its exercise measures: weight (kg), reps, time (seconds),
distance (metres), plus optional RPE, a warm-up flag and a done flag.

| Measure set | Used by |
|---|---|
| weight and reps | most lifts (squat, bench, row, curl, pull-up with a belt) |
| reps | push-up, hanging leg raise, ab wheel |
| time | plank, stair climber, skipping |
| time and distance | run, walk, rowing machine, bike |
| weight and distance | farmer carry |

## Working sets

A set counts when it is **done and not a warm-up**. Undone sets (an extra row never ticked) and
warm-ups are kept in the session but never add to anything below. Finishing a session drops
rows with no numbers at all.

## Volume

`set volume = weight × reps` for a working set with both; 0 otherwise (a timed or
distance set, or a bodyweight rep with no weight, contributes no volume).

`session volume = sum of set volumes`, shown rounded to the kilogram ("1,308 kg").

A week's volume (the Lifted tile and the week-on-week card) reads in **tonnes from 1,000 kg**:
"999 kg", then "1.3 t" (one decimal under 10 t), then "12 t" (whole tonnes). Rounding happens
on the kilograms first, so 999.6 kg is "1 t". Session rows and the session screen stay in kg;
a single session rarely passes a few thousand.

## Duration

`minutes = round((finish − start) / 60 s)`, never below 0; null while the session is open.

## Top set

The heaviest working set of a block; reps break a tie. Used by "last time" and by the
per-lift trend.

## Best set by measure

The per-lift trend (Gym > Week > Lifts) plots one working set per session, chosen by the
exercise's first measure: **weight** uses the top set above; **reps** the most reps; **time**
the longest; **distance** the furthest. Sets that did not record that measure are skipped;
null when nothing counts. "Best" on the lift page is the highest of those values over the
last 20 sessions, "Latest" the most recent session's.

## Week totals

Gym > Week adds up the **finished** sessions in its seven days (an open session has no
duration and may still change): sessions, distinct days trained, working sets, volume and
minutes, each by the rules above. "Sessions / planned" uses the training days per week from
the profile; with none declared the tile shows the count alone.

## Week on week

Gym > Week compares its seven days with the seven before them (`compareWeeks`). Both sides
use the week-total rules above: finished sessions only, working sets only.

- **Totals.** Volume, working sets and sessions for each week; the volume change is
  `(this − previous) / previous`, undefined (shown as "nothing lifted last week") when the
  previous week lifted nothing.
- **One measure per exercise.** An exercise is compared on its first declared measure in the
  order weight, reps, time, distance (the same choice as the lift page's chart). A deleted
  custom exercise, which has no declaration, is compared on the first of those its sets
  recorded, and is matched between weeks by name (case-insensitive).
- **Best of the week.** For each exercise, the best working set of each week on that measure
  (`bestSet` per session, the highest across the week's sessions), plus its working sets,
  volume and session count that week.
- **Change.** `delta = this week's best − previous week's best` in the measure's unit;
  `delta % = delta / previous best`, undefined when the previous best was 0 (such a gain
  ranks above every measured one). Exercises done in both weeks are ordered by the relative
  gain, then the absolute gain, so the **biggest gain** is the first with a positive delta and
  the **biggest drop** the last with a negative one.
- **New and missed.** Exercises done this week but not the previous one, and the reverse,
  are listed separately, most volume first.

The card leads with the biggest gain (its best set this week against the previous week's),
then the three totals with their change, then up to four other exercises by the size of their
move, then "New this week" and "Not this week". Nothing here feeds a target.

## Repeating a session

A repeat copies the title, the exercises and every set (weight, reps, time, distance, warm-up
flags) with fresh ids, nothing ticked done, no notes, no feel and no finish time, onto the day
chosen. "Add set" copies the previous set of the block, not done and not a warm-up.

## Not yet

Estimated one-rep max and personal records across all time arrive in slice 9 and will be
written up here first (the week-on-week card only looks one week back). Training days feeding water, protein, the weekly
review and recalibration are slice 10 and will be written up in `NUTRITION-MATHS.md`.

## Change log

- **2026-10-13**: week on week (`compareWeeks`, `biggestGain`, `biggestDrop`) for the gym
  Week's insights card, and the week's volume read in tonnes from 1,000 kg (`tonnageParts`).
  No existing rule changed.

- **2026-10-12** (D38): week totals (`summariseWorkouts`) and the best set by measure
  (`bestSet`) for the gym half's Week and Lifts. No existing rule changed.

- **2026-10-08** (slice 8): first version. Working sets, volume, duration, top set, repeat and
  next-set rules.
