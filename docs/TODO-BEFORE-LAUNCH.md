# To do before Minori goes live on the App Store

The owner's list, in the order to do it. Tick things off here. The detail behind each
item is in `docs/LEGAL.md` (law and conduct), `docs/APP-STORE.md` (Apple's review) and
`docs/NATIVE.md` (building the app). Prices are what they were when this was written
(October 2026) and should be checked on the day.

Nothing here affects the web app on Railway, which friends keep using throughout.

## 1. Decide who runs it

- [ ] **Your own name or a limited company.** A company is the strongest protection
      against being sued personally: it, not you, is the data controller and the party to
      the terms. Roughly 50 GBP to incorporate at Companies House and about 34 GBP a year
      for the confirmation statement, plus annual accounts (an accountant, or dormant
      accounts yourself while there is no income). Worth one conversation with an accountant.
- [ ] **Put the answer in the app.** `LEGAL_OPERATOR` in
      `apps/web/src/features/legal/legal.ts`. Until then the privacy policy and terms say
      "an independent developer", which is not good enough for a public release.

## 2. Contact details

- [ ] **A support email address**, dedicated rather than personal. Set
      `LEGAL_CONTACT_EMAIL` in the same file. That one line also switches on the "Report
      this estimate" link and replaces "contact the person who gave you the link" in the
      policy and the terms. Apple also asks for a support URL in the listing.

## 3. Register with the ICO

- [ ] **Take the self-assessment** at ico.org.uk ("data protection fee"). An app that
      stores health information about the public almost certainly has to pay.
- [ ] **Pay the fee.** The smallest tier (a sole trader or a company with up to 10 staff)
      is about 52 GBP a year, a few pounds less by direct debit. Not registering when you
      should is the thing the ICO fines small operators for.

## 4. Name and logo

- [ ] **Search for "Minori"** on the UK trade mark register (gov.uk, "search for a trade
      mark"), the EUIPO register and the App Store, looking for food, nutrition, health or
      fitness products. If something close exists in those classes, pick a different name
      before the listing, because the app id and the name are fixed once uploaded.
- [ ] **Optional: register the name.** About 170 GBP for one class in the UK, online.
- [ ] **Logo.** It was generated with ChatGPT. You may use it, but AI-made images probably
      cannot be protected by copyright, so nobody can be stopped from copying it. If that
      matters, have a designer redraw it (which also gives a vector file for sharper icons).

## 5. Confirm two facts about the hosting

- [ ] **Railway region.** Railway dashboard, project settings. The privacy policy says the
      data "may be stored or processed outside the UK and the EEA"; if the region is in
      the EU that sentence can be softened, and either way keep a note of the answer.
- [ ] **Data processing terms.** Keep a copy or a link of Railway's and OpenAI's data
      processing addendums. Check on OpenAI's site how long API requests are retained for
      abuse monitoring and that the policy's "not kept to train AI models" still holds.
- [ ] **Decide the web address.** The App Store build has the API address baked in. If you
      ever want a custom domain instead of the Railway subdomain, switch before the first
      upload.

## 6. Security gaps that need an email provider

- [ ] **Pick an email provider** (Resend's free tier is the obvious one) and tell the
      assistant. Then it can build:
  - [ ] **Forgot my password.** There is no reset today; a public audience will lock
        themselves out.
  - [ ] **Email verification.** Today anyone can register with someone else's address.
- [ ] **Turn on database backups** in Railway and note how long they are kept (it belongs
      in the privacy policy once known).

## 7. Have the paperwork read once

- [ ] **A solicitor reads `/privacy` and `/terms`** after sections 1 to 5 are filled in.
      About an hour of their time. The assistant wrote them from the published rules and
      is not a lawyer; health data is the category where a professional read is worth it.
- [ ] **Click every link on "Where the numbers come from"** (Settings). The citations were
      written from memory.

## 8. Build it

- [ ] **A Mac with Xcode**, borrowed, bought or rented by the hour in the cloud.
- [ ] **Apple Developer Program**: 79 GBP a year. If section 1 ended in a company, enrol as
      the company (needs a D-U-N-S number, free, takes a few days).
- [ ] **Build and run on an iPhone**, following `docs/NATIVE.md`, and go through its
      six-point first-run checklist. This is the first time the phone app has ever run.
- [ ] **TestFlight** to yourself and a friend for a few days.

## 9. The listing (App Store Connect)

- [ ] Create the app record with the name Minori and the id `app.minori.mobile`.
- [ ] Privacy answers, age rating, screenshots, listing text: items 10 to 14 in
      `docs/APP-STORE.md`.
- [ ] A demo account with a week of data, and review notes saying where account deletion
      is, that AI features ask permission, and that the app is not medical advice.
- [ ] Submit.

## After launch

- [ ] Renew the ICO fee and the Apple membership each year.
- [ ] If the data is ever exposed, `docs/LEGAL.md` section 6 is the procedure; the ICO must
      be told within 72 hours.

## Already done (for reference)

Permission before health data is stored and before anything goes to the AI; history older
than six months deleted automatically; export, correction and deletion in the app; privacy
policy with lawful basis, retention, transfers and the right to complain; terms with
governing law (England and Wales) and consumer-rights wording; calorie floors, capped
deficits, adults only, maintenance-only targets and an eating-disorder charity link for
flagged profiles; sources cited; AI output labelled, editable and reportable; app id, icon,
splash, iPhone-only build settings, token sign-in, reminders and share sheet for the phone
app.
