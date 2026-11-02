import type {
  CoachCard,
  CoachToolArgs,
  CoachToolName,
  Profile,
  coachToolArgsSchemas,
} from '@diet-tracker/shared'
import type { z } from 'zod'

/**
 * One tool (ai-coach skill, "The tools"): a name and description the model sees, the
 * shared zod argument schema, a status line for the screen, and `run`, which wraps an
 * existing service with the session's `userId` and returns a compact, labelled result. A
 * read tool returns plain data; a draft tool returns a `DraftResult` (the card for the
 * person and a summary for the model) and writes nothing.
 */

export interface ToolContext {
  userId: string
  profile: Profile
  now: Date
  /** The person's local today. */
  today: string
}

/** Every tool answers with this when there is nothing to show (rule 5). */
export interface EmptyResult {
  empty: true
  reason: string
}

export function empty(reason: string): EmptyResult {
  return { empty: true, reason }
}

/**
 * What a draft tool returns: the card the person sees (stored on the message, streamed as
 * a `card` event) and what the model is told about it, in words and rounded numbers, so it
 * can refer to the card without the card's full payload going into the replay.
 */
export interface DraftResult {
  card: CoachCard
  summary: Record<string, unknown>
}

export function isDraftResult(value: unknown): value is DraftResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'card' in value &&
    'summary' in value &&
    typeof (value as { card: unknown }).card === 'object'
  )
}

export interface CoachTool<N extends CoachToolName = CoachToolName> {
  name: N
  description: string
  schema: (typeof coachToolArgsSchemas)[N]
  /** "Looking at your last 5 squat sessions": shown while the tool runs and kept in the trail. */
  status: (args: CoachToolArgs[N], ctx: ToolContext) => string
  run: (ctx: ToolContext, args: CoachToolArgs[N]) => Promise<unknown>
}

/**
 * A tool with its argument type erased, for the registry. `run` and `status` only ever
 * receive arguments parsed by the tool's own schema (agent.ts), so the erasure is safe.
 */
export interface AnyCoachTool {
  name: CoachToolName
  description: string
  schema: z.ZodType
  status: (args: never, ctx: ToolContext) => string
  run: (ctx: ToolContext, args: never) => Promise<unknown>
}

export function defineTool<N extends CoachToolName>(tool: CoachTool<N>): AnyCoachTool {
  return tool as AnyCoachTool
}
