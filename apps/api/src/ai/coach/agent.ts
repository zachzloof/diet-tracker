import {
  COACH_MAX_OUTPUT_TOKENS,
  COACH_MAX_TOOL_ROUNDS,
  COACH_REPLAY_TURNS,
  COACH_SUMMARY_CHARS,
  COACH_UNAVAILABLE_TEXT,
  coachCardSchema,
  localDay,
  type CoachCard,
  type CoachEvent,
  type CoachMessage,
  type CoachToolTrailEntry,
  type Profile,
} from '@diet-tracker/shared'
import type * as Responses from 'openai/resources/responses/responses'
import { zodResponsesFunction } from 'openai/helpers/zod'
import { toResponseInputItems } from 'openai/lib/responses/ResponseInputItems'
import { env } from '../../env.js'
import { AppError } from '../../errors.js'
import { logger } from '../../logger.js'
import {
  AI_TIMEOUT_MS,
  describeAiError,
  getClient,
  isRetryable,
  logCall,
  reasoningOptions,
} from '../openai.js'
import { buildBriefing, loadBriefingInputs } from './briefing.js'
import { COACH_SYSTEM_PROMPT } from './prompt.js'
import { COACH_TOOLS, isDraftResult, toolByName, type ToolContext } from './tools/index.js'

/**
 * The tool loop (ai-coach skill, "Flow for one turn"): briefing, replayed thread, the
 * person's message, then at most `COACH_MAX_TOOL_ROUNDS` model rounds. Each round streams
 * text deltas to the caller as they arrive, runs the function calls the model made (in
 * parallel) and appends their outputs; the loop ends on a round with no calls. Every round
 * is one `ai_calls` row with purpose `coach`. A draft tool's card is emitted as a `card`
 * event the moment the tool returns and kept for the stored message (slice 11b).
 */

type StreamParams = Responses.ResponseCreateParamsStreaming

/** The one seam the tests use: a scripted client in place of OpenAI. */
export interface CoachModelClient {
  stream(
    params: StreamParams,
    options: { timeout: number },
  ): Promise<AsyncIterable<Responses.ResponseStreamEvent>>
}

/** Set by tests; null means the real OpenAI client. */
export const coachModel: { override: CoachModelClient | null } = { override: null }

function realClient(): CoachModelClient {
  return {
    stream: async (params, options) =>
      getClient('coach').responses.create(params, options) as Promise<
        AsyncIterable<Responses.ResponseStreamEvent>
      >,
  }
}

export function coachModelName(): string {
  return env.OPENAI_COACH_MODEL ?? env.OPENAI_MODEL
}

/** Plain strict function tools built from the shared zod schemas. */
export function coachToolDefinitions(): Responses.FunctionTool[] {
  return COACH_TOOLS.map((tool) => {
    const built = zodResponsesFunction({
      name: tool.name,
      description: tool.description,
      parameters: tool.schema,
    })
    return {
      type: 'function',
      name: built.name,
      description: built.description ?? null,
      parameters: built.parameters,
      strict: true,
    }
  })
}

export interface TurnArgs {
  userId: string
  profile: Profile
  /** Earlier messages of the thread, oldest first, before the one being answered. */
  history: readonly CoachMessage[]
  text: string
  now: Date
  /** Receives `status`, `delta` and `card` events as they happen. */
  emit: (event: CoachEvent) => void | Promise<void>
  model?: CoachModelClient
}

export interface TurnResult {
  text: string
  /** The cards the draft tools returned this turn, in the order they were drafted. */
  cards: CoachCard[]
  toolTrail: CoachToolTrailEntry[]
  aiCallIds: string[]
  /** What went wrong, for the log; the stored text is then the failure copy. */
  error: string | null
}

const RETRY_BACKOFF_MS = 1500
const MAX_TOOL_OUTPUT_CHARS = 12_000

/**
 * Earlier turns as plain messages. The last `COACH_REPLAY_TURNS` turns go in full; older
 * ones are cut to one line. Tool calls and reasoning are not replayed: the model re-reads
 * a lift or a day through a tool when a follow-up needs it, which is cheaper on every later
 * turn than carrying the results, and avoids replaying reasoning items at all.
 */
export function replayHistory(history: readonly CoachMessage[]): Responses.ResponseInputItem[] {
  const usable = history.filter((m) => m.error === null && m.text.trim().length > 0)
  const fullFrom = Math.max(0, usable.length - COACH_REPLAY_TURNS * 2)
  return usable.map((m, i) => ({
    role: m.role,
    content: i < fullFrom ? summarise(m.text) : m.text,
  }))
}

function summarise(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length <= COACH_SUMMARY_CHARS
    ? oneLine
    : `${oneLine.slice(0, COACH_SUMMARY_CHARS - 1).trimEnd()}…`
}

interface RoundOutcome {
  text: string
  calls: Responses.ResponseFunctionToolCall[]
  response: Responses.Response
}

export async function runTurn(args: TurnArgs): Promise<TurnResult> {
  const client = args.model ?? coachModel.override ?? realClient()
  const model = coachModelName()
  const toolTrail: CoachToolTrailEntry[] = []
  const cards: CoachCard[] = []
  const aiCallIds: string[] = []
  const texts: string[] = []
  const ctx: ToolContext = {
    userId: args.userId,
    profile: args.profile,
    now: args.now,
    today: localDay(args.now, args.profile.timezone),
  }

  try {
    const briefing = buildBriefing(await loadBriefingInputs(args.userId, args.profile, args.now))
    const input: Responses.ResponseInputItem[] = [
      { role: 'system', content: `${COACH_SYSTEM_PROMPT}\n\n${briefing}` },
      ...replayHistory(args.history),
      { role: 'user', content: args.text },
    ]
    const tools = coachToolDefinitions()
    const reasoning = reasoningOptions(model, 'low')
    const isReasoningModel = 'reasoning' in reasoning

    for (let round = 1; round <= COACH_MAX_TOOL_ROUNDS + 1; round++) {
      const last = round > COACH_MAX_TOOL_ROUNDS
      if (last) {
        input.push({
          role: 'developer',
          content:
            'You have used every tool call allowed for this turn. Answer now from the briefing and the results you already have.',
        })
      }
      const params: StreamParams = {
        model,
        input,
        tools: last ? [] : tools,
        tool_choice: last ? 'none' : 'auto',
        parallel_tool_calls: true,
        store: false,
        max_output_tokens: COACH_MAX_OUTPUT_TOKENS,
        stream: true,
        ...(isReasoningModel ? { include: ['reasoning.encrypted_content'] } : {}),
        ...reasoning,
      }
      const outcome = await streamRound(client, params, args, ctx, toolTrail, aiCallIds)
      if (outcome.text.trim()) texts.push(outcome.text.trim())
      if (outcome.calls.length === 0 || last) break

      input.push(...toResponseInputItems(outcome.response.output))
      const outputs = await Promise.all(
        outcome.calls.map((call) => runCall(call, ctx, toolTrail, cards, args.emit)),
      )
      input.push(...outputs)
    }

    const text = texts.join('\n\n')
    if (!text) {
      return {
        text: COACH_UNAVAILABLE_TEXT,
        cards,
        toolTrail,
        aiCallIds,
        error: 'the model answered with no text',
      }
    }
    return { text, cards, toolTrail, aiCallIds, error: null }
  } catch (error) {
    const described = describeAiError(error).slice(0, 500)
    logger.warn({ err: error, userId: args.userId }, 'coach turn failed')
    return { text: COACH_UNAVAILABLE_TEXT, cards, toolTrail, aiCallIds, error: described }
  }
}

/** One model round, with one retry on a transient failure before anything was streamed. */
async function streamRound(
  client: CoachModelClient,
  params: StreamParams,
  args: TurnArgs,
  ctx: ToolContext,
  toolTrail: CoachToolTrailEntry[],
  aiCallIds: string[],
): Promise<RoundOutcome> {
  for (let attempt = 1; ; attempt++) {
    const start = performance.now()
    let text = ''
    const calls: Responses.ResponseFunctionToolCall[] = []
    let response: Responses.Response | null = null
    let failure: string | null = null
    try {
      const stream = await client.stream(params, { timeout: AI_TIMEOUT_MS })
      for await (const event of stream) {
        switch (event.type) {
          case 'response.output_text.delta':
            text += event.delta
            await args.emit({ event: 'delta', data: { text: event.delta } })
            break
          case 'response.output_item.done':
            if (event.item.type === 'function_call') {
              calls.push(event.item)
              await args.emit({
                event: 'status',
                data: { tool: event.item.name, text: statusFor(event.item, ctx) },
              })
            }
            break
          case 'response.completed':
          case 'response.incomplete':
            response = event.response
            break
          case 'response.failed':
            failure = event.response.error?.message ?? 'the model failed'
            break
          case 'error':
            failure = event.message
            break
          default:
            break
        }
      }
      if (failure || !response) throw new Error(failure ?? 'the stream ended without a response')
      const latencyMs = Math.round(performance.now() - start)
      const incomplete = response.status === 'incomplete'
      aiCallIds.push(
        await logCall({
          userId: args.userId,
          purpose: 'coach',
          model: response.model,
          inputTokens: response.usage?.input_tokens ?? null,
          cachedInputTokens: response.usage?.input_tokens_details?.cached_tokens ?? null,
          outputTokens: response.usage?.output_tokens ?? null,
          latencyMs,
          ok: true,
          error: incomplete
            ? `incomplete: ${response.incomplete_details?.reason ?? 'unknown'}`
            : null,
          webSearchCalls: 0,
        }),
      )
      return { text, calls, response }
    } catch (error) {
      const latencyMs = Math.round(performance.now() - start)
      aiCallIds.push(
        await logCall({
          userId: args.userId,
          purpose: 'coach',
          model: String(params.model ?? coachModelName()),
          inputTokens: null,
          cachedInputTokens: null,
          outputTokens: null,
          latencyMs,
          ok: false,
          error: describeAiError(error).slice(0, 500),
          webSearchCalls: 0,
        }),
      )
      if (attempt === 1 && text === '' && calls.length === 0 && isRetryable(error)) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS))
        continue
      }
      // The trail keeps what was looked at before the failure.
      void toolTrail
      throw error
    }
  }
}

function statusFor(call: Responses.ResponseFunctionToolCall, ctx: ToolContext): string {
  const tool = toolByName(call.name)
  if (!tool) return 'Looking something up'
  try {
    const parsed = tool.schema.safeParse(JSON.parse(call.arguments))
    // The schema is the tool's own, so a successful parse is the tool's argument type.
    return parsed.success ? tool.status(parsed.data as never, ctx) : 'Looking something up'
  } catch {
    return 'Looking something up'
  }
}

/**
 * Parses, runs and times one call; a bad argument or a thrown error goes back to the model
 * as text (an `AppError`'s own message, such as the estimator's daily cap, so the model can
 * explain it). A draft tool's card is validated, kept and emitted; the model sees its summary.
 */
async function runCall(
  call: Responses.ResponseFunctionToolCall,
  ctx: ToolContext,
  toolTrail: CoachToolTrailEntry[],
  cards: CoachCard[],
  emit: TurnArgs['emit'],
): Promise<Responses.ResponseInputItem.FunctionCallOutput> {
  const start = performance.now()
  const tool = toolByName(call.name)
  let output: string
  let ok = false
  let parsedArgs: Record<string, unknown> = {}
  let summary = 'Looking something up'
  if (!tool) {
    output = JSON.stringify({ error: `no tool called ${call.name}` })
  } else {
    let raw: unknown
    try {
      raw = JSON.parse(call.arguments)
    } catch {
      raw = undefined
    }
    const parsed = tool.schema.safeParse(raw)
    if (!parsed.success) {
      output = JSON.stringify({
        error: `arguments rejected: ${parsed.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.map(String).join('.') || 'input'}: ${issue.message}`)
          .join('; ')}`,
      })
    } else {
      parsedArgs = parsed.data as Record<string, unknown>
      summary = tool.status(parsed.data as never, ctx)
      try {
        const result = await tool.run(ctx, parsed.data as never)
        if (isDraftResult(result)) {
          const card = coachCardSchema.parse(result.card)
          cards.push(card)
          await emit({ event: 'card', data: { card } })
          output = JSON.stringify({ card_id: card.id, ...result.summary })
        } else {
          output = JSON.stringify(result)
        }
        if (output.length > MAX_TOOL_OUTPUT_CHARS) {
          output = `${output.slice(0, MAX_TOOL_OUTPUT_CHARS)}…(cut)`
        }
        ok = true
      } catch (error) {
        logger.warn({ err: error, tool: call.name }, 'coach tool failed')
        output = JSON.stringify({
          error:
            error instanceof AppError
              ? `${error.message} (tell the person in your own words)`
              : 'that lookup failed; answer without it',
        })
      }
    }
  }
  toolTrail.push({
    name: call.name,
    arguments: parsedArgs,
    summary,
    ms: Math.round(performance.now() - start),
    ok,
  })
  return { type: 'function_call_output', call_id: call.call_id, output }
}
