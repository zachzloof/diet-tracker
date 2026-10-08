# Outstanding after slice 5

Parked on 2026-09-26 until the owner has used the app for about a week. Nothing here blocks
friends using the app from the Railway URL. Revisit from 2026-10-03.

## Decisions waiting on the owner

| Item                                         | Where               | The short version                                                                                                                                                                                                                                                                                 |
| -------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contact email on the legal pages             | `apps/web/src/features/legal/legal.ts` | `LEGAL_CONTACT_EMAIL` is `null`; the privacy policy and terms say "contact the person who gave you the link". Both stores need a support contact. One constant to fill.                                                                                                              |
| Email provider and "forgot my password"      | DECISIONS.md open questions | Change password exists; a reset flow does not, and nothing in the repo resets one (a short admin script against the database is the stopgap). Resend's free tier is the obvious pick. Decide before the app goes beyond friends.                                                        |
| Custom domain vs Railway subdomain           | DECISIONS.md open questions | The Railway subdomain is fine for the friends group. A custom domain changes `APP_ORIGIN` and nothing else.                                                                                                                                                                             |

## Deferred from slice 5

- **A week of daily use** by the owner and one friend with no visible bugs. Everything was walked headless; this is the check only real phones can do.
- **Reminders fire only while the app is open** in the web app. A web app cannot wake itself; the settings card says so (D22). The native shells schedule them with the OS (`@capacitor/local-notifications`, wired 2026-09-30, untested on a device).
- **Native shells are prepared, not built or run.** Since 2026-09-30 the code is store-ready on paper (D23 option B, D25, the plugins), but nothing has been compiled: `apps/web/android` needs Android Studio, `apps/web/ios` needs a Mac with Xcode. The first build on a real iPhone is the test of sign-in, safe areas, reminders and the export share sheet. Steps in NATIVE.md; what is left for the listing in APP-STORE.md.
- **Lighthouse performance is in the 70s** under its simulated slow 4G with 4x CPU throttle (accessibility, SEO and best practices are at 100). The app-shell JavaScript is about 500 KB uncompressed; moving the score means code-splitting the vendor bundle. Real-device feel matters more than this number; judge it during the week.
- **The estimator's "Describe" path stays disabled offline** by design; My foods and manual entries queue.

## Noticed after slice 5, not fixed yet

- **Contrast in the entry sheet** (axe-core, 2026-09-26). In dark mode the Delete button's red text is 4.05:1 on its tinted background, under the 4.5:1 AA line; lightening the dark `--danger` token slightly (for example `#f0595e`, about 4.8:1) would fix it everywhere the destructive button appears. In light mode the P, C and F letters in the sheet's summary strip use the macro colours on a pale surface (1.5 to 2.3:1), the same known issue as the light-mode macro colours in the slice 4 deferrals. Both predate the fixes after slice 5; the slice 5 Lighthouse runs did not open this sheet.

## Noticed during slice 6 (2026-10-01), not fixed

- **A hard reload within about a second of a change can show the old list for up to a minute.** The offline mirror (D21) writes to the phone's storage at most once a second, and a restored list counts as fresh for 60 seconds. Seen once in the slice 6 walk: a meal saved, the page reloaded straight away, and the Meals tab listed the meals without it. It affects every mirrored list (foods, day logs, meals), not only meals, and only when the app is closed or reloaded immediately after a change. A likely fix is to mark everything stale after the mirror is restored so it refetches in the background; not done because it changes when every screen fetches.
- **The offline banner covers the top half of the header.** It is 32 px tall and fixed over the 56 px header, so header buttons (the day arrows on Today, "New meal" on Meals, back) are half covered while offline. Predates slice 6.
- **A serving name is used as the unit of an entry.** A food saved as "1 medium (120 g)" logs as quantity 1, unit "1 medium". Slice 6 changed how that is shown ("1 × 1 medium"), not what is stored. Storing "medium" as the unit would be cleaner and is a change to how My foods logs.

## Worth watching during the week

- **Preferences** (D37, 2026-10-08). Settings > Preferences switches off water, workouts or everything beyond the macros. Worth deciding after use: should the manual food form also drop sugar, saturated fat and sodium in macros mode (it keeps the nine packet numbers today), and should "macros only" also silence the limits in the day-status line (a maintain or lose day can still fail on sodium or added sugar while the tiles are hidden)?
- **Gym logging** (slice 8, D35, D36, 2026-10-08). Use it at the gym for a week: is the set row quick enough one-handed (the number pill toggles warm-up, the greyed "last time" fills the row, the tick marks it done)? Does "Saved on this phone" appear and clear as the signal comes and goes? Is a Workouts tab wanted, or is the Today card plus You > Workouts enough? Known gaps: no reordering of exercises, sets removed only from the end, no rest timer, no pounds. Slice 9 is per-exercise charts and PRs; slice 10 feeds training days into water, protein, the weekly review and recalibration.
- **Logged meals as one row** (D33, 2026-10-08). Does the meal sheet cover what you reach for (edit an ingredient, move or delete the lot)? Two things were left out on purpose: "Save as a meal" from a logged meal that came from the estimator without the tickbox, and re-logging a meal from its row on Today. Meals logged before 2026-10-08 stay as separate lines.
- **Scoring bands and upper limits** (D34, 2026-10-08). Water never reads "Over"; the Today card cautions in words at 4 litres (`WATER_CAUTION_ML`), which a heavy trainer with a 4 to 5 litre target will see on an ordinary day. Vitamin A's red flag uses the preformed-retinol UL against an RAE estimate, so a very carrot- or sweet-potato-heavy day may show red; one line in `UPPER_LIMIT` to drop. Energy within 10% is now the bar for a met day; watch whether that feels too strict after a week.
- **Goal-aware "day met"** (D31, 2026-10-07). After a week: does the maintain rule (protein close is enough, every limit counts) feel right for anyone on that goal? A one-line change in `dayMetRule`.
- **"Add to meals" on the review card** (slice 7, D32, 2026-10-07). Does the suggested name read well often enough, and should the tickbox remember being ticked? Also: hitting the 100-meal cap while confirming fails the whole log with the cap message rather than logging without the meal; fine for now, say if it bites.
- **The four new nutrients** (vitamin E, K, iodine, omega-3; D30, 2026-10-07). Do the daily numbers look plausible for what you ate, and is iodine too noisy to keep scored? Entries logged before 2026-10-07 show 0 for all four and AI entries from before then read as low confidence; re-estimating old entries was not done (it would cost a call per entry).
- Whether the AI estimates feel right for the foods you actually eat, and whether "4 eggs" the second time reuses your saved food (D5, D14).
- The OpenAI bill: `ai_calls` has tokens per call and `web_search_calls` per named-product lookup (D16). `AI_WEB_SEARCH=false` switches search off without a deploy.
- Whether the recalibration check fires when expected (14 days after your first targets, with ten logged days and four weigh-ins) and whether its proposal reads as sensible.
- Whether anything logged offline arrived late, twice or not at all. The queue toasts "Sent N queued entries" when it flushes.
- iOS: does the Home Screen install work, does the app stay signed in, do notifications show once installed.
- Anything that felt like a dead end: a screen with no way forward, an error without a retry, a button that did nothing.

## Questions to answer at the revisit

1. Any bug or confusion a friend hit that was not obvious to you?
2. Did you use export? Did the CSV open cleanly in a spreadsheet?
3. Did the recalibration proposal make sense, and did you apply or snooze it?
4. Is the friends-only PWA enough for now, or is it time for TestFlight (which forces D23)?
5. Which of the ideas at the bottom of PLAN.md, if any, would you use every day?

## Not on this list

The ideas after slice 5 (coach chat, photo estimation, barcodes, USDA lookup, recipes, sharing a week, Apple Health sync) stay in PLAN.md as ideas, not commitments.
