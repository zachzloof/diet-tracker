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

## Duration

`minutes = round((finish − start) / 60 s)`, never below 0; null while the session is open.

## Top set

The heaviest working set of a block; reps break a tie. Used by "last time" and, from slice 9,
by the per-exercise chart.

## Repeating a session

A repeat copies the title, the exercises and every set (weight, reps, time, distance, warm-up
flags) with fresh ids, nothing ticked done, no notes, no feel and no finish time, onto the day
chosen. "Add set" copies the previous set of the block, not done and not a warm-up.

## Not yet

Estimated one-rep max, personal records, weekly tonnage and the per-exercise trend arrive in
slice 9 and will be written up here first. Training days feeding water, protein, the weekly
review and recalibration are slice 10 and will be written up in `NUTRITION-MATHS.md`.

## Change log

- **2026-10-08** (slice 8): first version. Working sets, volume, duration, top set, repeat and
  next-set rules.
