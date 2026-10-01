# Legal and conduct checklist

What a nutrition app with an AI feature, run from the UK, has to get right before it is
offered to the public, and where Minori stands (2026-10-01). Written by the assistant from
the published rules; it is not legal advice, and the owner should have a solicitor read
the privacy policy and the terms once the blanks below are filled.

Status: `done` is in the repo; `needs owner` is a fact only the owner can supply or a
choice only the owner can make; `open` is work not started.

## 1. Data protection (UK GDPR, Data Protection Act 2018; EU GDPR for EU users)

Weight, body measurements, food intake, pregnancy, breastfeeding and eating-disorder
history are **health data**, a special category under Article 9. That raises the bar on
everything below.

| Item                                                                                         | Status        | Notes                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lawful basis and explicit consent for health data (Art. 6 and 9(2)(a))                       | `done` | A checkbox on the first onboarding step, before any body or health answer; the API refuses a first profile without it and records `profiles.health_consent_at` (D26). Accounts made before 2026-10-01 have no record. |
| Privacy policy: who the controller is, with a contact                                        | `needs owner` | The section exists; `LEGAL_OPERATOR` and `LEGAL_CONTACT_EMAIL` in `legal.ts` are still empty, so it reads "an independent developer". |
| Privacy policy: lawful basis, retention, international transfers, right to complain to the ICO | `done` | Added 2026-10-01: why we are allowed to, how long we keep it (six months, enforced by `purgeExpiredData`, D27), US processors, the ICO complaint route. |
| Right of access and portability                                                              | `done`        | Settings, Your data: JSON and CSV export.                                                                                                                                                                 |
| Right to erasure                                                                             | `done`        | Settings, Delete account: everything cascades, immediately.                                                                                                                                               |
| Right to rectification                                                                       | `done`        | Profile, entries and weigh-ins are editable.                                                                                                                                                              |
| Data minimisation                                                                            | `done`        | AI requests carry a profile summary and never the email or an account id; `ai_calls` stores usage counts, not text; OpenAI requests are sent with `store: false`.                                         |
| Processors named with safeguards                                                             | `needs owner` | Railway (hosting; region set in the Railway project) and OpenAI (US). Both publish a data processing addendum; confirm the Railway region and keep a note of both DPAs.                                    |
| ICO registration fee                                                                         | `needs owner` | Most UK controllers must pay the ICO's data protection fee; the "personal, family or household" exemption does not cover an app offered to the public. Use the ICO's online self-assessment.               |
| Breach procedure (72 hours to the ICO)                                                       | `done` | Section 6 below. |
| Cookies and local storage (PECR)                                                             | `done`        | One strictly necessary session cookie and functional local storage; no banner needed. The policy says so.                                                                                                 |
| Children                                                                                     | `done`        | Under-18 date of birth is refused at onboarding; no data is stored for a refused profile.                                                                                                                 |
| Email verification                                                                           | `open`        | Anyone can register with someone else's address. Low risk while the audience is friends; add verification with the password reset when an email provider is chosen.                                       |

## 2. Health and safety conduct

| Item                                                                                | Status | Notes                                                                                                                                                             |
| ----------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No medical claims, disclaimers everywhere advice appears                            | `done` | Register, onboarding, You, Settings, Targets, Privacy, Terms, Sources.                                                                                            |
| Not a medical device (UK MHRA, EU MDR)                                              | `done` | General-wellness targets from published formulas, no diagnosis or treatment claims. Keep it that way in the listing text.                                          |
| Safety floors on energy, capped deficits, no under-18s                              | `done` | Never below `max(BMR, 1200/1500 kcal)`; deficit at most 25% of TDEE; refused overrides below the floor.                                                            |
| Pregnancy, breastfeeding, eating-disorder history                                   | `done` | Maintenance targets only, recalibration disabled, professional-guidance note.                                                                                     |
| Signposting for eating disorders                                                    | `done` | Beat (beateatingdisorders.org.uk) is linked from the health step, the maintenance note on Targets and `/sources`. |
| Sources cited                                                                       | `done` | `/sources`. The owner should click every link once; they were written from memory.                                                                                |
| AI output labelled and editable, permission asked first                             | `done` | Estimates show assumptions and confidence and can be edited; consent card before any AI call (D25).                                                               |
| Way to report a bad estimate                                                        | `done` | "Report this estimate" under the review card opens an email to the support address; hidden until `LEGAL_CONTACT_EMAIL` is set. |

## 3. Terms of use

| Item                                                            | Status        | Notes                                                                                                                     |
| --------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Not medical advice, use at your own risk, adults only           | `done`        |                                                                                                                           |
| Liability limited "to the extent the law allows"                | `done`        | UK consumer law never lets a business exclude liability for death or personal injury caused by negligence; the wording respects that. |
| Who the contract is with, governing law and courts              | `needs owner` | Governing law is England and Wales with consumer-rights wording (assumed; say if it should differ). The party is "the independent developer" until `LEGAL_OPERATOR` is set. |
| Account termination and acceptable use                          | `done`        |                                                                                                                           |
| Changes to the terms, notice                                    | `done`        | "The date at the top says when." Consider emailing on material changes once there is an email provider.                   |
| Apple's standard EULA                                           | `done`        | Applies automatically unless a custom one is uploaded; the in-app terms sit alongside it.                                  |

## 4. Who is liable

The single biggest protection against being sued personally is not a paragraph of text: it
is running the app through a limited company, so the company is the controller and the
party to the terms. That is the owner's call and a conversation with an accountant (about
100 GBP a year in filing costs if there is no revenue). Professional indemnity or product
liability insurance exists for apps but is unusual for a free one.

## 5. Intellectual property

| Item                                                     | Status        | Notes                                                                                                                                          |
| -------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| The name "Minori"                                        | `needs owner` | Search the UK IPO and EUIPO trade mark registers and the App Store for a conflicting nutrition or health product before the listing is created. |
| The logo                                                 | `needs owner` | Generated with ChatGPT. OpenAI's terms give the output to the user, but AI-made images may not attract copyright, so nobody can stop a copy.   |
| Nutrition data                                           | `done`        | AI estimates and the person's own entries; no copied database.                                                                                 |
| Open-source licences                                     | `done`        | MIT and Apache dependencies; nothing copyleft.                                                                                                 |

## 6. If data is exposed (breach procedure)

1. **Stop it.** In Railway, rotate `SESSION_SECRET` (signs everyone out), the database password and `OPENAI_API_KEY`; redeploy. If an account was taken over, delete its rows from `sessions`.
2. **Find out what was reached.** Railway's deploy and request logs, and the `sessions` and `ai_calls` tables. Write down what, whose, and when.
3. **Tell the ICO within 72 hours** of becoming aware if people's data was or may have been accessed (ico.org.uk, "report a breach"). Health data makes almost any exposure reportable.
4. **Tell the people affected** without delay, by email, in plain words: what happened, what data, what to do (change the password here and anywhere it was reused).
5. **Write it up** in this repo: cause, fix, date. The ICO can ask for the record.

## 7. What is left

`docs/TODO-BEFORE-LAUNCH.md` is the owner's ordered list.
