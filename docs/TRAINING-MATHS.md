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
distance (metres), plus optional RPE and a done flag. A block of a bodyweight exercise also
holds its **bodyweight load**: the kilograms of you each rep lifts (see Bodyweight below).

| Measure set | Used by |
|---|---|
| weight and reps | most lifts (squat, bench, row, curl); pull-up, chin-up and dip, where the weight is what you add (a belt) and can be left blank |
| reps | push-up, hanging leg raise, ab wheel |
| time | plank, stair climber, skipping |
| time and distance | run, walk, rowing machine, bike |
| weight and distance | farmer carry |

## Working sets

A set counts when it is **ticked done**. Undone sets (an extra row never ticked) are kept in
the session but never add to anything below. There is no warm-up flag: a light first set you
tick counts like any other (removed 2026-10-30). Finishing a session drops
rows with no numbers at all.

## Volume

`set volume = load × reps` for a working set, where
`load = the block's bodyweight load + the weight on the set`. It is 0 when the set has no reps
(a timed or distance set) or no load at all (reps of an exercise that lifts no bodyweight,
with no weight entered).

For a barbell, dumbbell, machine, cable or kettlebell lift the bodyweight load is nothing, so
this is `weight × reps` as it always was. For a bodyweight exercise the load is the share of
you each rep lifts: 20 push-ups at 80 kg are `80 × 20 = 1,600 kg`, and 5 pull-ups with a
10 kg belt are `(80 + 10) × 5 = 450 kg`.

`session volume = sum of set volumes`, shown rounded to the kilogram ("1,308 kg").

A week's volume (the Lifted tile and the week-on-week card) reads in **tonnes from 1,000 kg**:
"999 kg", then "1.3 t" (one decimal under 10 t), then "12 t" (whole tonnes). Rounding happens
on the kilograms first, so 999.6 kg is "1 t". Session rows and the session screen stay in kg;
a single session rarely passes a few thousand.

## Bodyweight (D44)

Each exercise has a **bodyweight share** from 0 to 1: how much of you one rep lifts.

| Exercise | Share | Why |
|---|---|---|
| Pull-up, chin-up, dip | 1 | You hang or press your whole body. |
| Push-up | 1 | The owner's rule: a push-up scores at bodyweight. Measured on force plates, the hands carry about 64 to 75% of body weight, the feet the rest; see D44 for the option of using that. |
| Hanging leg raise | 0.35 | Both legs are about a third of body mass (each leg is 16 to 20% in the standard body-segment tables). |
| Ab wheel rollout | 0.5 | From the knees, about half your weight travels, as in a knee push-up (49 to 62% measured). |
| Back extension | 0.5 | Everything above the hips: head, arms and trunk, about half of body mass. |
| Russian twist | 0.3 | Head, arms and upper trunk, as in a crunch. |
| Plank, and anything timed | 0 | No reps, so no volume. |
| Every other catalogue exercise | 0 | Barbell, dumbbell, machine, cable, kettlebell and cardio count the weight entered, nothing of you. |
| Your own exercise | 1 if its equipment is Bodyweight and a set counts reps, else 0 | When you add one of that kind you can pick all, about half (0.5, a sit-up), about a third (0.3, a crunch) or none. |

`bodyweight load = share × your body weight on the session's day`, rounded to 0.1 kg
(`bodyweightLoadKg`); an exact half rounds up.

**Your weight on the day** is the latest weigh-in on or before the session's day; with none
that early, the earliest weigh-in after it; with no weigh-ins at all, the weight on your
profile. Before onboarding there is no weight and no load.

**Worked out once, then kept.** The server works the load out when an exercise is first
saved into a session and stores it on the block. Later saves keep that figure while the block
still points at the same exercise, so a session's kilograms do not move when you weigh in
later, when a weigh-in older than a year is purged, or when a custom exercise is deleted. A
block with no load yet is tried again on each save, so a session started before you had a
weight on file picks one up.

**On the phone.** While a session is being logged the phone fills in its own figure from the
exercise list and the profile weight (`fillBodyweightLoads`), so push-ups count in the tally
straight away and with no signal. When the save lands it takes the server's figure, which is
the one every other screen shows. The session screen says what is counted under the exercise
name: "Each rep counts 75.1 kg of your bodyweight".

**Backdated.** Migration 0019 gave every block already logged its load by the same rules, from
the weigh-ins on file on 2026-11-05.

**What it does not do.** A squat, lunge or calf raise also moves most of you; they are not
counted, because volume for a loaded lift is the weight on the bar by convention and the
numbers would stop matching any other log. Repeating a session works the loads out afresh at
that day's weight. "Heaviest weight" (the `weight` metric below) stays the weight you added,
so an unweighted pull-up has no value on it.

## Duration

`minutes = round((finish − start) / 60 s)`, never below 0; null while the session is open.

**The running clock.** While a session is open, the tally pinned at the top of the session
screen counts `elapsed = now − start` in whole seconds (rounded down, never below 0) and shows
it as a stopwatch: "12:34", then "1:02:03" past the hour (`workoutElapsedS`). Once the session
is finished the same spot shows the minutes above ("48 min"), as every session card does.
Reopening a finished session runs the clock from the original start again, so the time it sat
finished counts. Beside the clock, the tally's sets done and kilograms lifted are the working
sets and session volume above, updated as each set is ticked.

## What "best" means (D39)

Every place that ranks sets ranks them on one **metric**. An exercise's **measure** is its
first declared one in the order weight, reps, time, distance (a deleted custom exercise uses
the first its sets recorded). The metric is that measure, except for a lift compared on
weight that records reps, where **Settings > Preferences > Best set** decides:

| Preference | Metric | A set's value |
|---|---|---|
| Weight × reps (the default) | `volume` | kilograms lifted in that one set, `load × reps`: the set volume above, bodyweight load included |
| Heaviest weight | `weight` | the weight on the bar |

So 30 kg × 15 (450 kg) beats 35 kg × 10 (350 kg) by default, and 35 kg × 10 beats it under
"Heaviest weight". An exercise with weight but no reps (a farmer carry) ranks on weight either
way; reps, time and distance exercises are untouched by the preference. A push-up records
reps only, so it is ranked on reps; its kilograms show in the totals. A pull-up records
weight and reps, so by default it is ranked on kilograms lifted with your bodyweight in:
12 unweighted at 80 kg (960 kg) beat 5 with a 10 kg belt (450 kg). Each session is read with
the load it had that day.

**Ranking (`bestSetBy`).** Only working sets with a value on the metric count. The highest
value wins; ties on kilograms lifted go to the heavier set, then to more reps; ties on weight
go to more reps; otherwise the earlier set wins. The old "top set" (heaviest, reps break a
tie) is this ranking on `weight`.

## Last and Best beside a set

A session shows one greyed set beside each of yours, chosen by the Last / Best switch in the
header (remembered on the phone, "Last" to begin with):

- **Last**: the set at the same position in the most recent earlier session where this
  exercise was done (`lastDoneSession`): the latest with a set ticked, else, when no earlier
  session ticked one, the latest with any numbers in it, so a plan copied forward and never
  ticked is still shown. A session where the exercise was skipped (no sets, or only blank
  rows) is passed over, so it never blanks the column. Within the session chosen, its sets
  show done or not. The coach's workout card reads "last time" the same way.
- **Best**: the best working set at that position across the last 20 sessions with this
  exercise (`bestSetAt`), by the metric above. Set 3's best is compared with set 3; a session
  with fewer sets has no candidate for the later positions, and an unticked set at that
  position never counts.

The session being edited is never its own reference. Tapping the greyed set copies it into
the row.

## Best set per session

The per-lift trend (Gym > Week > Lifts) plots one working set per session, the best on the
metric above: kilograms lifted or the heaviest weight for a lift (by the preference), the
most reps, the longest time, the furthest distance. Sets that did not record it are skipped;
null when nothing counts. The page reads a range of 4 weeks, 3 months (the default), 6
months or a year. "Best" on the lift page is the highest of those values over the sessions
in that range, "Latest" the most recent session's.

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
- **One metric per exercise.** An exercise is compared on its measure (first declared in the
  order weight, reps, time, distance, the same choice as the lift page's chart), turned into
  a metric by the rule in "What best means": kilograms lifted in one set for a lift by
  default, the heaviest weight under that preference. A deleted custom exercise, which has
  no declaration, is compared on the first measure its sets recorded, and is matched between
  weeks by name (case-insensitive).
- **Best of the week.** For each exercise, the best working set of each week on that metric
  (`bestSetBy` over the week's sets), plus its working sets, volume and session count that
  week.
- **Change.** `delta = this week's best − previous week's best` in the metric's unit (kg
  lifted, kg on the bar, reps, seconds or metres); `delta % = delta / previous best`,
  undefined when the previous best was 0 (such a gain ranks above every measured one).
  Exercises done in both weeks are ordered by the relative gain, then the absolute gain, so
  the **biggest gain** is the first with a positive delta and the **biggest drop** the last
  with a negative one. With the default, 30 kg × 15 after a week of 35 kg × 10 reads
  "+100 kg" (450 from 350); under "Heaviest weight" it reads "−5 kg".
- **New and missed.** Exercises done this week but not the previous one, and the reverse,
  are listed separately, most volume first.

The card leads with the biggest gain (its best set this week against the previous week's),
then the three totals with their change, then up to four other exercises by the size of their
move, then "New this week" and "Not this week". Nothing here feeds a target.

## Repeating a session

A repeat copies the title, the exercises and every set (weight, reps, time, distance) with
fresh ids, nothing ticked done, no notes, no feel and no finish time, onto the day chosen.
Bodyweight loads are not copied; they are worked out for the new day.
"Add set" copies the previous set of the block, not done.

## Not yet

Estimated one-rep max and personal records across all time arrive in slice 9 and will be
written up here first (the week-on-week card only looks one week back). Training days feeding water, protein, the weekly
review and recalibration are slice 10 and will be written up in `NUTRITION-MATHS.md`.

## Change log

- **2026-11-05** (D44): **Rule change:** bodyweight counts toward volume. A set's volume is
  `load × reps` with `load = bodyweight load + weight`, where it was `weight × reps`, so a
  push-up, pull-up, chin-up, dip, hanging leg raise, ab wheel rollout, Russian twist or back
  extension no longer scores 0. Each exercise has a bodyweight share; a block stores
  `share × body weight on the day` (`bodyweightLoadKg`, `bodyWeightOn`), worked out once by
  the server. Session, day, week and week-on-week totals, the coach's numbers and "kg lifted
  in one set" for a lift (`setMetricValue`, `bestSetAcross`) all include it. Past sessions
  were backdated by migration 0019, so earlier weeks' totals rose where they held bodyweight
  work. Lifts with no bodyweight share are unchanged.

- **2026-11-03**: **Rule change:** "Best" on a lift's page is the best over the chosen
  range (4 weeks to a year, 3 months to start), not over the last 20 sessions. Last and Best
  beside a set still read the last 20 sessions.

- **2026-11-03**: **Rule change:** "Last" beside a set reads the most recent earlier session
  where the exercise was done (`lastDoneSession`: a set ticked, else any numbers), not the
  most recent session that merely contained it. Skipping leg press in one session used to
  leave its Last column blank in the next.

- **2026-11-03**: the running clock on an open session (`workoutElapsedS`) for the session
  screen's tally. No existing rule changed.

- **2026-10-19** (D39): what "best" means. A lift that records reps is ranked on the
  kilograms lifted in one set (weight × reps) by default, or on the heaviest weight by the
  new Best set preference (`bestBy`); other exercises keep their measure. Applies to the new
  Last / Best column on a session (`bestSetAt`), the week-on-week card (`compareWeeks` takes
  a `basis`; its deltas are in the metric's unit) and the lift page. `bestSetBy` with its
  tie-breaks replaces the separate top-set and best-set rankings (`topSet` and `bestSet`
  remain as names for it). **Rule change:** week-on-week deltas for lifts were in kg on the
  bar; by default they are now kg lifted in one set.

- **2026-10-13**: week on week (`compareWeeks`, `biggestGain`, `biggestDrop`) for the gym
  Week's insights card, and the week's volume read in tonnes from 1,000 kg (`tonnageParts`).
  No existing rule changed.

- **2026-10-12** (D38): week totals (`summariseWorkouts`) and the best set by measure
  (`bestSet`) for the gym half's Week and Lifts. No existing rule changed.

- **2026-10-08** (slice 8): first version. Working sets, volume, duration, top set, repeat and
  next-set rules.
