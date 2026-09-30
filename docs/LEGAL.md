# Legal and conduct checklist

What a nutrition app with an AI feature, run from the UK, has to get right before it is
offered to the public, and where Minori stands (2026-09-30). Written by the assistant from
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
| Lawful basis and explicit consent for health data (Art. 6 and 9(2)(a))                       | `open`        | Onboarding collects the health answers with no explicit consent step. Add a checkbox before the health questions: "I agree to Minori storing my health information to work out my targets", recorded with a timestamp on the profile. |
| Privacy policy: who the controller is, with a contact                                        | `needs owner` | `/privacy` has no legal identity and `LEGAL_CONTACT_EMAIL` is empty. Needs the name (person or company), a postal or email address.                                                                       |
| Privacy policy: lawful basis, retention, international transfers, right to complain to the ICO | `open`        | The policy lists what is stored and who processes it, but not for how long, on what basis, that OpenAI and (probably) Railway are outside the UK, or that people can complain to the ICO.                 |
| Right of access and portability                                                              | `done`        | Settings, Your data: JSON and CSV export.                                                                                                                                                                 |
| Right to erasure                                                                             | `done`        | Settings, Delete account: everything cascades, immediately.                                                                                                                                               |
| Right to rectification                                                                       | `done`        | Profile, entries and weigh-ins are editable.                                                                                                                                                              |
| Data minimisation                                                                            | `done`        | AI requests carry a profile summary and never the email or an account id; `ai_calls` stores usage counts, not text; OpenAI requests are sent with `store: false`.                                         |
| Processors named with safeguards                                                             | `needs owner` | Railway (hosting; region set in the Railway project) and OpenAI (US). Both publish a data processing addendum; confirm the Railway region and keep a note of both DPAs.                                    |
| ICO registration fee                                                                         | `needs owner` | Most UK controllers must pay the ICO's data protection fee; the "personal, family or household" exemption does not cover an app offered to the public. Use the ICO's online self-assessment.               |
| Breach procedure (72 hours to the ICO)                                                       | `open`        | Nothing written down. One paragraph: who checks, what gets rotated (`SESSION_SECRET`, `OPENAI_API_KEY`, database password), how users are told.                                                           |
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
| Signposting for eating disorders                                                    | `open` | Add a helpline line to the professional-guidance note (UK: Beat, 0808 801 0677) and to `/sources`. Cheap, and it is what reviewers and clinicians look for.        |
| Sources cited                                                                       | `done` | `/sources`. The owner should click every link once; they were written from memory.                                                                                |
| AI output labelled and editable, permission asked first                             | `done` | Estimates show assumptions and confidence and can be edited; consent card before any AI call (D25).                                                               |
| Way to report a bad estimate                                                        | `open` | Both stores ask for one for AI-generated content. A "Report this estimate" button that emails the support address is enough.                                      |

## 3. Terms of use

| Item                                                            | Status        | Notes                                                                                                                     |
| --------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Not medical advice, use at your own risk, adults only           | `done`        |                                                                                                                           |
| Liability limited "to the extent the law allows"                | `done`        | UK consumer law never lets a business exclude liability for death or personal injury caused by negligence; the wording respects that. |
| Who the contract is with, governing law and courts              | `needs owner` | No legal identity, no governing-law clause (England and Wales is the natural choice).                                     |
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

## 6. What to fill in, in order

1. Legal identity and contact address for the policy and the terms (person or company).
2. `LEGAL_CONTACT_EMAIL` (a dedicated address, not a personal one).
3. Railway region, then the international-transfer wording.
4. ICO fee self-assessment.
5. Then the assistant can rewrite `/privacy` and `/terms` with the missing sections, add the
   health-data consent step and the eating-disorder signposting, and add the report button.
