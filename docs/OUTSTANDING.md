# Outstanding after slice 5

Parked on 2026-09-26 until the owner has used the app for about a week. Nothing here blocks
friends using the app from the Railway URL. Revisit from 2026-10-03.

## Decisions waiting on the owner

| Item                                         | Where               | The short version                                                                                                                                                                                                                                                                                 |
| -------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What the native shell loads                  | DECISIONS.md D23    | A: point the shell at the deployed site (cookies work, updates with every push, Apple may reject a bare wrapper, blank offline until cached). B: bundle the build and move sessions to a bearer token for native (about a day). Recommendation: A for a first TestFlight to friends, B before a store submission. |
| Contact email on the legal pages             | `apps/web/src/features/legal/legal.ts` | `LEGAL_CONTACT_EMAIL` is `null`; the privacy policy and terms say "contact the person who gave you the link". Both stores need a support contact. One constant to fill.                                                                                                              |
| Email provider and "forgot my password"      | DECISIONS.md open questions | Change password exists; a reset flow does not, and nothing in the repo resets one (a short admin script against the database is the stopgap). Resend's free tier is the obvious pick. Decide before the app goes beyond friends.                                                        |
| Custom domain vs Railway subdomain           | DECISIONS.md open questions | The Railway subdomain is fine for the friends group. A custom domain changes `APP_ORIGIN` and nothing else.                                                                                                                                                                             |

## Deferred from slice 5

- **A week of daily use** by the owner and one friend with no visible bugs. Everything was walked headless; this is the check only real phones can do.
- **Reminders fire only while the app is open** on that device. A web app cannot wake itself; the settings card says so (D22). Reliable reminders with the app closed come with the native shell (`@capacitor/local-notifications`).
- **Native shells are scaffolded, not built.** `apps/web/android` needs Android Studio, `apps/web/ios` needs a Mac with Xcode. Steps in NATIVE.md; store requirements in APP-STORE.md.
- **Lighthouse performance is in the 70s** under its simulated slow 4G with 4x CPU throttle (accessibility, SEO and best practices are at 100). The app-shell JavaScript is about 500 KB uncompressed; moving the score means code-splitting the vendor bundle. Real-device feel matters more than this number; judge it during the week.
- **The estimator's "Describe" path stays disabled offline** by design; My foods and manual entries queue.

## Worth watching during the week

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
