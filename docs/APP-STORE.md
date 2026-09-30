# Getting Minori onto the App Store

Where the app stands against Apple's review guidelines, and what is left. Google Play asks
for much the same and is noted where it differs. Both stores review a diet app more
carefully than a to-do list: it touches health, it has an AI feature, and it stores personal
data. Nothing here is legal advice; it is a checklist from the published guidelines as of
September 2026.

**Status (2026-09-30): the code is prepared, nothing has been built or run on a device.**
The web app on Railway is unaffected and stays the way friends use it. Everything in the
first table is in the repo; everything in the second list needs the owner, a Mac, or an
Apple Developer account.

## In place

| Requirement                                                       | Where                                                                                                                                           |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| More than a website in a wrapper (Apple 4.2)                      | The shell runs the bundled build, not the site (D23 B): opens offline, reminders scheduled with the OS, exports through the share sheet         |
| Sign-in that works inside the shell                               | Bearer-token sessions for native, token in the Keychain or Keystore (D23); email and password only, so Sign in with Apple is not required (4.8) |
| In-app account deletion (Apple 5.1.1(v), Google account deletion) | Settings, Delete account: two confirmations, one cascading delete, session cleared                                                              |
| Permission before data goes to third-party AI (Apple 5.1.2(i))    | Every AI feature asks first and says what is sent to OpenAI; Settings, AI features turns it off (D25)                                           |
| Privacy policy in the app and at a public URL (5.1.1(i))          | `/privacy` (open to anyone; use `https://<domain>/privacy` in the listing)                                                                      |
| Terms of use, linked at sign-up                                   | `/terms`; the register screen links both                                                                                                        |
| Citations for health information (1.4.1)                          | `/sources`, "Where the numbers come from" in Settings                                                                                           |
| Health disclaimer, no medical claims (1.4.1)                      | Onboarding, You, Settings, Register, Privacy, Terms and Sources all say the targets are guidance, not medical advice                            |
| Adults only                                                       | Onboarding refuses a date of birth under 18 (D10)                                                                                               |
| Safety defaults for pregnancy, breastfeeding, eating disorders    | Maintenance targets plus a professional-guidance note (D10); recalibration disabled for flagged profiles                                        |
| Data export                                                       | Settings, Your data: JSON, food log CSV, weigh-ins CSV                                                                                          |
| Only the permissions it uses (5.1.1(iii))                         | Notifications, asked when a reminder is switched on. No location, camera, contacts, tracking or HealthKit                                       |
| App id, name, icon, splash                                        | `app.minori.mobile`, "Minori"; 1024 px icon with no alpha; splash on the app background                                                         |
| iPhone only, portrait                                             | `TARGETED_DEVICE_FAMILY = 1`, so no iPad screenshots or iPad layout review                                                                      |
| Export compliance                                                 | `ITSAppUsesNonExemptEncryption` is false in `Info.plist` (HTTPS only)                                                                           |
| Works offline / degrades gracefully                               | Offline mirror of recent data plus a queue for writes (D21)                                                                                     |

## Left to do, in order

### Needs a decision or a detail from the owner

0. **Legal and conduct.** `docs/LEGAL.md` is the data-protection, health-conduct, terms and IP checklist with what is still open. Its blanks (legal identity, contact address, Railway region) are the same ones the store listing needs.

1. **Contact email.** `apps/web/src/features/legal/legal.ts` has `LEGAL_CONTACT_EMAIL = null`, so the privacy policy says "contact the person who gave you the link". Apple wants a real contact in the policy and a support URL in the listing. One constant; a dedicated address is better than a personal one.
2. **A stable API address.** The native build has the API origin baked in (`VITE_API_ORIGIN`). If the Railway subdomain is ever swapped for a custom domain, every installed copy needs an update, so settle the domain before the first upload.
3. **Forgot my password.** Not required by the guidelines, but a store audience will lock themselves out and there is no reset flow (needs an email provider; open question in DECISIONS.md).
4. **Who the seller is.** An individual developer account shows your legal name on the listing; an organisation needs a D-U-N-S number.

### Needs a Mac and an Apple Developer account (99 USD a year)

5. **Build and run it on an iPhone.** Steps in `docs/NATIVE.md`. This is the first time the native paths run at all; check sign-in survives a restart, the notch and home indicator are not covered or double-padded, a reminder fires with the app closed, and an export opens the share sheet.
6. **Signing.** Pick the team in Xcode (Signing & Capabilities); automatic signing is fine.
7. **Privacy manifest.** Xcode's archive validation says if `PrivacyInfo.xcprivacy` is needed at the app level. The Capacitor plugins ship their own; the app's own Swift code uses no required-reason API.
8. **TestFlight first.** Upload the archive, add yourself and a friend as testers, use it for a few days.

### In App Store Connect

9. **Check the name "Minori" is free** when creating the app record. If it is taken, a suffix ("Minori: Nutrition Tracker") usually works; the name under the icon stays "Minori".
10. **App Privacy answers ("nutrition labels").** Data linked to the user, used for app functionality only, no tracking: email address (contact info), health and fitness (weight, body measurements, food intake), user content (the food you type), and that a third party processes it (OpenAI for the AI features, Railway for hosting).
11. **Age rating.** Answer the questionnaire; the app itself refuses under-18s, so pick the adult tier if the answers leave a choice.
12. **Screenshots.** One set of large-iPhone screenshots is required; App Store Connect shows the exact pixel sizes it accepts. Today, the Log sheet with an estimate, Week, Targets.
13. **Review notes and a demo account.** Reviewers must be able to sign in: create an account with a week of data on production and give its email and password in the review notes. Say that the AI features use OpenAI, that consent is asked in-app, and where Delete account is.
14. **Listing text.** Say that food estimates are AI-generated and may be inaccurate, and that the app is not medical advice. Do not claim it treats, diagnoses or prevents anything.

### Google Play, when wanted

A one-off developer account fee. The Android project builds on any machine with Android Studio. Play asks for a Data safety form (same answers as item 10), a content rating questionnaire and a privacy policy URL, and new personal accounts must run a closed test with a group of testers before production.

## What a reviewer is most likely to push back on

- **4.2 minimum functionality.** The answer is the first row of the table: it is not the website in a frame.
- **5.1.2(i) AI data sharing.** Point at the consent card and the Settings switch.
- **1.4.1 health claims.** Point at `/sources` and the disclaimers. If they ask for more, the recalibration proposal and the weekly review are the two places that give advice; both say they are general guidance.
- **Account deletion not found.** It is two taps from You: Settings, Delete account. Say so in the review notes.

## Testing paths

- iOS: TestFlight needs the paid Apple Developer account. The `ios/` project builds only on macOS with Xcode.
- Android: the `android/` project builds anywhere with Android Studio or the command-line SDK.
- Friends can keep using the web app from the Railway URL throughout.
