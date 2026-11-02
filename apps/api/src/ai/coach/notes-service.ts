import {
  COACH_MAX_NOTES,
  coachNoteSchema,
  type CoachNote,
  type CoachNoteInput,
} from '@diet-tracker/shared'
import { and, asc, count, desc, eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { db } from '../../db/client.js'
import { coachNotes, type CoachNoteRow } from '../../db/schema/index.js'
import { errors } from '../../errors.js'

/**
 * Notes the person asked the coach to remember (slice 11b). Written only by
 * `POST /coach/notes` after a `note` card is confirmed; never by the model. Every note goes
 * into the briefing, so the count is capped at `COACH_MAX_NOTES`.
 */

export const COACH_NOTES_FULL_MESSAGE = `You have ${COACH_MAX_NOTES} notes, which is the most the coach can carry. Delete one under Coach > Notes to add another.`

export function toWireNote(row: CoachNoteRow): CoachNote {
  return coachNoteSchema.parse({
    id: row.id,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
  })
}

/** Newest first, as the Notes screen lists them. */
export async function listNotes(userId: string): Promise<CoachNote[]> {
  const rows = await db
    .select()
    .from(coachNotes)
    .where(eq(coachNotes.userId, userId))
    .orderBy(desc(coachNotes.createdAt), desc(coachNotes.id))
  return rows.map(toWireNote)
}

/** Oldest first, for the briefing and the export. */
export async function allNotes(userId: string): Promise<CoachNote[]> {
  const rows = await db
    .select()
    .from(coachNotes)
    .where(eq(coachNotes.userId, userId))
    .orderBy(asc(coachNotes.createdAt), asc(coachNotes.id))
  return rows.map(toWireNote)
}

export async function createNote(
  userId: string,
  input: CoachNoteInput,
  now: Date = new Date(),
): Promise<CoachNote> {
  const existing = await db
    .select({ n: count() })
    .from(coachNotes)
    .where(eq(coachNotes.userId, userId))
  if ((existing[0]?.n ?? 0) >= COACH_MAX_NOTES) throw errors.conflict(COACH_NOTES_FULL_MESSAGE)
  const rows = await db
    .insert(coachNotes)
    .values({ id: uuidv7(), userId, text: input.text, createdAt: now })
    .returning()
  const row = rows[0]
  if (!row) throw new Error('coach note insert returned no row')
  return toWireNote(row)
}

export async function deleteNote(userId: string, id: string): Promise<void> {
  const deleted = await db
    .delete(coachNotes)
    .where(and(eq(coachNotes.id, id), eq(coachNotes.userId, userId)))
    .returning({ id: coachNotes.id })
  if (deleted.length === 0) throw errors.notFound()
}
