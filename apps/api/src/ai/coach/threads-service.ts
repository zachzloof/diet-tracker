import {
  COACH_MAX_THREADS_LISTED,
  COACH_TITLE_CHARS,
  coachMessageSchema,
  coachThreadSchema,
  localDay,
  startOfLocalDay,
  type CoachCard,
  type CoachCardStateRequest,
  type CoachMessage,
  type CoachThread,
  type CoachToolTrailEntry,
} from '@diet-tracker/shared'
import { and, asc, count, desc, eq, gte, sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { db } from '../../db/client.js'
import {
  coachMessages,
  coachThreads,
  type CoachMessageRow,
  type CoachThreadRow,
} from '../../db/schema/index.js'
import { errors } from '../../errors.js'

/**
 * Threads and messages (ai-coach skill). Everything is scoped by `user_id` from the
 * session: a thread id that belongs to someone else reads as not found.
 */

export function toWireThread(row: CoachThreadRow): CoachThread {
  return coachThreadSchema.parse({
    id: row.id,
    title: row.title,
    turns: row.turns,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
}

export function toWireMessage(row: CoachMessageRow): CoachMessage {
  return coachMessageSchema.parse({
    id: row.id,
    threadId: row.threadId,
    role: row.role,
    text: row.text,
    cards: row.cards,
    toolTrail: row.toolTrail,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  })
}

/** Threads with at least one turn, most recently active first. */
export async function listThreads(userId: string): Promise<CoachThread[]> {
  const rows = await db
    .select()
    .from(coachThreads)
    .where(and(eq(coachThreads.userId, userId), gte(coachThreads.turns, 1)))
    .orderBy(desc(coachThreads.updatedAt))
    .limit(COACH_MAX_THREADS_LISTED)
  return rows.map(toWireThread)
}

export async function createThread(userId: string, now: Date = new Date()): Promise<CoachThread> {
  const rows = await db
    .insert(coachThreads)
    .values({ id: uuidv7(), userId, title: '', turns: 0, createdAt: now, updatedAt: now })
    .returning()
  const row = rows[0]
  if (!row) throw new Error('coach thread insert returned no row')
  return toWireThread(row)
}

/**
 * The chat a tapped brief opens (slice 11c): a thread whose first line is the brief, as an
 * assistant message, so the coach knows what it said and the person can reply to it. A
 * brief thread the person has not answered yet (no turns, same first line) is reused rather
 * than piled up; once answered it is an ordinary thread.
 */
export async function openBriefThread(
  userId: string,
  text: string,
  now: Date = new Date(),
): Promise<CoachThread> {
  const unanswered = await db
    .select({ id: coachThreads.id })
    .from(coachThreads)
    .where(and(eq(coachThreads.userId, userId), eq(coachThreads.turns, 0)))
    .orderBy(desc(coachThreads.createdAt))
    .limit(10)
  for (const candidate of unanswered) {
    const first = (await listMessages(candidate.id))[0]
    if (first && first.role === 'assistant' && first.text === text) {
      return toWireThread(await requireThread(userId, candidate.id))
    }
  }
  const thread = await createThread(userId, now)
  await addAssistantMessage(
    { id: thread.id, userId },
    { text, cards: [], toolTrail: [], aiCallIds: [], error: null },
    now,
  )
  return toWireThread(await requireThread(userId, thread.id))
}

export async function requireThread(userId: string, id: string): Promise<CoachThreadRow> {
  const rows = await db
    .select()
    .from(coachThreads)
    .where(and(eq(coachThreads.id, id), eq(coachThreads.userId, userId)))
    .limit(1)
  const row = rows[0]
  if (!row) throw errors.notFound()
  return row
}

/** The thread with its messages, oldest first. */
export async function getThread(
  userId: string,
  id: string,
): Promise<{ thread: CoachThread; messages: CoachMessage[] }> {
  const row = await requireThread(userId, id)
  const messages = await listMessages(id)
  return { thread: toWireThread(row), messages }
}

export async function listMessages(threadId: string): Promise<CoachMessage[]> {
  const rows = await db
    .select()
    .from(coachMessages)
    .where(eq(coachMessages.threadId, threadId))
    .orderBy(asc(coachMessages.createdAt), asc(coachMessages.id))
  return rows.map(toWireMessage)
}

export async function deleteThread(userId: string, id: string): Promise<void> {
  const deleted = await db
    .delete(coachThreads)
    .where(and(eq(coachThreads.id, id), eq(coachThreads.userId, userId)))
    .returning({ id: coachThreads.id })
  if (deleted.length === 0) throw errors.notFound()
}

/** Every thread with its messages, oldest first, for the account export (D24). */
export async function allThreads(
  userId: string,
): Promise<(CoachThread & { messages: CoachMessage[] })[]> {
  const [threads, messages] = await Promise.all([
    db
      .select()
      .from(coachThreads)
      .where(eq(coachThreads.userId, userId))
      .orderBy(asc(coachThreads.createdAt)),
    db
      .select()
      .from(coachMessages)
      .where(eq(coachMessages.userId, userId))
      .orderBy(asc(coachMessages.createdAt), asc(coachMessages.id)),
  ])
  return threads.map((thread) => ({
    ...toWireThread(thread),
    messages: messages.filter((m) => m.threadId === thread.id).map(toWireMessage),
  }))
}

/** User messages this person sent since their local midnight: the daily turn cap's count. */
export async function turnsToday(userId: string, timeZone: string, now: Date): Promise<number> {
  const since = startOfLocalDay(localDay(now, timeZone), timeZone)
  const rows = await db
    .select({ n: count() })
    .from(coachMessages)
    .where(
      and(
        eq(coachMessages.userId, userId),
        eq(coachMessages.role, 'user'),
        gte(coachMessages.createdAt, since),
      ),
    )
  return rows[0]?.n ?? 0
}

/** Stores the person's message and counts the turn; the title is the thread's first message. */
export async function addUserMessage(
  thread: CoachThreadRow,
  text: string,
  now: Date,
): Promise<{ thread: CoachThread; message: CoachMessage }> {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(coachMessages)
      .values({
        id: uuidv7(),
        userId: thread.userId,
        threadId: thread.id,
        role: 'user',
        text,
        cards: [],
        toolTrail: [],
        aiCallIds: [],
        error: null,
        createdAt: now,
      })
      .returning()
    const message = inserted[0]
    if (!message) throw new Error('coach message insert returned no row')
    const updated = await tx
      .update(coachThreads)
      .set({
        turns: sql`${coachThreads.turns} + 1`,
        updatedAt: now,
        ...(thread.turns === 0 ? { title: titleFrom(text) } : {}),
      })
      .where(eq(coachThreads.id, thread.id))
      .returning()
    const row = updated[0]
    if (!row) throw new Error('coach thread update returned no row')
    return { thread: toWireThread(row), message: toWireMessage(message) }
  })
}

export interface AssistantMessageInput {
  text: string
  cards: CoachCard[]
  toolTrail: CoachToolTrailEntry[]
  aiCallIds: string[]
  error: string | null
}

export async function addAssistantMessage(
  thread: Pick<CoachThreadRow, 'id' | 'userId'>,
  input: AssistantMessageInput,
  now: Date,
): Promise<CoachMessage> {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(coachMessages)
      .values({
        id: uuidv7(),
        userId: thread.userId,
        threadId: thread.id,
        role: 'assistant',
        text: input.text,
        cards: input.cards,
        toolTrail: input.toolTrail,
        aiCallIds: input.aiCallIds,
        error: input.error,
        createdAt: now,
      })
      .returning()
    const message = inserted[0]
    if (!message) throw new Error('coach message insert returned no row')
    await tx.update(coachThreads).set({ updatedAt: now }).where(eq(coachThreads.id, thread.id))
    return toWireMessage(message)
  })
}

/**
 * Records that the person confirmed or dismissed a card (slice 11b). The card lives in the
 * message's `cards` JSONB; the thread is the person's own, else not found. A card already
 * confirmed or dismissed keeps its first state: the confirm endpoint has run by then.
 */
export async function setCardState(
  userId: string,
  threadId: string,
  cardId: string,
  input: CoachCardStateRequest,
): Promise<CoachMessage> {
  await requireThread(userId, threadId)
  const messages = await db
    .select()
    .from(coachMessages)
    .where(and(eq(coachMessages.threadId, threadId), eq(coachMessages.userId, userId)))
  const row = messages.find((m) => m.cards.some((card) => card.id === cardId))
  if (!row) throw errors.notFound()
  const current = row.cards.find((card) => card.id === cardId)
  if (!current) throw errors.notFound()
  if (current.state !== 'drafted') return toWireMessage(row)
  const cards = row.cards.map((card) =>
    card.id === cardId ? { ...card, state: input.state } : card,
  )
  const updated = await db
    .update(coachMessages)
    .set({ cards })
    .where(eq(coachMessages.id, row.id))
    .returning()
  const saved = updated[0]
  if (!saved) throw new Error('coach message update returned no row')
  return toWireMessage(saved)
}

export function titleFrom(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length <= COACH_TITLE_CHARS
    ? oneLine
    : `${oneLine.slice(0, COACH_TITLE_CHARS - 1).trimEnd()}…`
}
