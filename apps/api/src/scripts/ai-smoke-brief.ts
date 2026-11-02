import { COACH_BRIEF_HALVES, type CoachBriefHalf } from '@diet-tracker/shared'
import { desc, eq } from 'drizzle-orm'
import { acceptableSentence, briefUserMessage, draftBrief, getBrief } from '../ai/coach/brief.js'
import { loadBriefingInputs } from '../ai/coach/briefing.js'
import { closeDb, db } from '../db/client.js'
import { aiCalls, coachBriefs, users } from '../db/schema/index.js'
import { SEED_USERS } from '../db/seed-data.js'
import { getProfile } from '../profile/profile-service.js'

/**
 * `pnpm ai:smoke:brief [--only finn|tess] [--fresh]`: builds today's brief for both halves
 * as the seeded Finn and Tess against the local database, prints the facts, the app's own
 * sentence and the model's (with tokens and latency from `ai_calls`), and says whether the
 * model's sentence passed the number check. `--fresh` deletes today's cached briefs first
 * so the model is asked again. Run `pnpm db:seed` first. Not in CI.
 */

const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const fresh = args.includes('--fresh')

async function main(): Promise<void> {
  const people = SEED_USERS.filter((u) => !only || u.email.startsWith(only))
  for (const person of people) {
    const row = (await db.select().from(users).where(eq(users.email, person.email)).limit(1))[0]
    if (!row) {
      console.log(`${person.email}: not seeded (run pnpm db:seed)`)
      continue
    }
    const profile = await getProfile(row.id)
    if (!profile) continue
    if (fresh) await db.delete(coachBriefs).where(eq(coachBriefs.userId, row.id))
    const inputs = await loadBriefingInputs(row.id, profile)
    for (const half of COACH_BRIEF_HALVES as readonly CoachBriefHalf[]) {
      const draft = draftBrief(inputs, half)
      console.log(`\n=== ${person.email} · ${half} ===`)
      console.log(briefUserMessage(draft))
      const start = performance.now()
      const brief = await getBrief(row.id, profile, half)
      const ms = Math.round(performance.now() - start)
      const call = (
        await db
          .select()
          .from(aiCalls)
          .where(eq(aiCalls.userId, row.id))
          .orderBy(desc(aiCalls.createdAt))
          .limit(1)
      )[0]
      console.log(`\nApp's own: ${draft.sentence}`)
      console.log(
        `Shown:     ${brief.text}${brief.model ? ` (${brief.model}, ${ms} ms, ${call?.inputTokens ?? '?'} in / ${call?.outputTokens ?? '?'} out)` : ' (app sentence: no key, cap, empty day or the model was refused)'}`,
      )
      if (brief.model) {
        console.log(
          `Check:     ${acceptableSentence(brief.text, draft.facts) ? 'every number traced to the facts' : 'FAILED the number check'}`,
        )
      }
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => closeDb())
