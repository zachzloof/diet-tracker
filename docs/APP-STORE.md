# What the App Store and Play Store will ask for

Notes gathered in slice 5 so the native submission is not a surprise. Both stores review a
diet app more carefully than a to-do list: it touches health, it has an AI feature, and it
stores personal data. Nothing here is legal advice; it is the checklist from the published
review guidelines as of September 2026.

## Already in place

| Requirement                                                        | Where                                                                                                                |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| In-app account deletion (Apple 5.1.1(v), Google account deletion) | Settings, Delete account: two confirmations, one cascading delete, session cleared                                   |
| Data export                                                        | Settings, Your data: JSON, food log CSV, weigh-ins CSV                                                                |
| Privacy policy reachable in-app and at a public URL                | `/privacy` (open to anyone; link it from the store listing)                                                           |
| Terms of use                                                       | `/terms`                                                                                                             |
| Health disclaimer, no medical claims (Apple 1.4.1, 5.1.1)          | Onboarding, You, Settings, Register, Privacy and Terms all say the targets are guidance, not medical advice           |
| Age gate: adults only (Apple 1.4.3 for diet content)               | Onboarding refuses a date of birth under 18 (D10)                                                                     |
| Safety defaults for pregnancy, breastfeeding, eating disorders     | Maintenance targets plus a professional-guidance note (D10); recalibration disabled for flagged profiles              |
| Icons at every size, including a 1024 px store icon               | `apps/web/public/icons/` (generated from `favicon.svg`; 1024 has no alpha and no rounded corners, as Apple requires) |
| Change password                                                    | Settings                                                                                                             |
| Works offline / degrades gracefully                                | Offline mirror of recent data plus a queue for writes (D21)                                                          |

## Still to do before submitting

1. **Contact email.** `apps/web/src/features/legal/legal.ts` has `LEGAL_CONTACT_EMAIL = null`; the pages say "contact the person who gave you the link". Both stores need a support URL or email in the listing and Apple wants it in the privacy policy.
2. **Sign in with Apple.** Only required if a third-party login (Google, Facebook) is added (Apple 4.8). Today there is only email and password, so it is not needed. If Google sign-in ever arrives, add Apple's at the same time (D4).
3. **Privacy "nutrition labels" (Apple) and Data safety form (Google).** Declare: email (account), health and fitness data (weight, food intake, body measurements), and that data is sent to a third party for processing (OpenAI, for the AI features). No tracking, no advertising identifiers, no analytics. Say that deletion is available in-app.
4. **Apple's health data rules (5.1.3).** The app must not use health data for advertising, must not write false data to HealthKit, and should not store health data in iCloud. None of that applies yet; if HealthKit weight sync is added later, add the HealthKit usage string and keep the data out of iCloud.
5. **AI disclosure.** Both stores now ask apps that generate content with AI to say so and to have a way to report bad output. The review card already shows the assumptions and confidence; add a one-line "estimated by AI" note in the listing description and consider a "report this estimate" affordance later.
6. **Minimum functionality (Apple 4.2).** A pure web wrapper can be rejected. Loading the bundled build (D23 option B) plus at least one native capability (local notifications for reminders, haptics, share sheet for the export) makes the case. Reminders are the obvious first plugin: `@capacitor/local-notifications` replaces the in-tab timer in `stores/reminders.ts`.
7. **Age rating.** Choose 17+ / Mature on Apple ("Medical/Treatment Information" is not needed; "Unrestricted Web Access" is not either once the bundle is local). On Google, complete the content questionnaire; the diet content usually lands at Teen or Mature 17+.
8. **Screenshots.** 6.7" and 6.1" iPhone, plus 12.9" iPad if iPad is supported (set `UIDeviceFamily` to iPhone only to skip it). Android: phone at 1080 x 1920 or larger.
9. **App name.** "Diet Tracker" is generic and may collide; the working name is fine for TestFlight and internal testing but pick a real name before the listing (the icon and `capacitor.config.ts` `appName` change together).
10. **Session cookies in the native shell.** WKWebView and the Android WebView do keep cookies for the app's own origin, but the bundled build runs on `capacitor://localhost` while the API is on the Railway domain, so the `SameSite=Lax` cookie will not be sent cross-site. Either load the deployed site (option A) or switch the session transport to a bearer token in secure storage for native (option B, the change D4 anticipated).

## Testing paths

- iOS: TestFlight needs an Apple Developer account (paid). The `ios/` project builds only on macOS with Xcode; `docs/NATIVE.md` has the steps.
- Android: the `android/` project builds anywhere with Android Studio or the command-line SDK; internal testing on Play needs a developer account (one-off fee).
- Friends can keep using the PWA from the Railway URL throughout; the native shell adds nothing they need yet.
