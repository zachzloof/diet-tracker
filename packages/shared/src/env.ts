import { z } from 'zod'

/** Treat an empty string as "not set" so `KEY=` lines in .env behave like a missing var. */
const optionalString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().optional(),
)

/** `true`/`false`, `1`/`0`, `on`/`off`, `yes`/`no`; an empty or missing value takes the default. */
function booleanFlag(defaultValue: boolean) {
  return z.preprocess((value) => {
    if (typeof value !== 'string') return value
    const normalised = value.trim().toLowerCase()
    if (normalised === '') return undefined
    if (['true', '1', 'on', 'yes'].includes(normalised)) return true
    if (['false', '0', 'off', 'no'].includes(normalised)) return false
    return value
  }, z.boolean().default(defaultValue))
}

/**
 * The API's environment contract. `apps/api/.env.example` documents every variable;
 * this schema enforces it at boot so a bad value fails fast with its name.
 */
export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z
    .string({ error: 'DATABASE_URL is required' })
    .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must be a postgresql:// URL'),

  SESSION_SECRET: z
    .string({ error: 'SESSION_SECRET is required' })
    .min(
      32,
      "SESSION_SECRET must be at least 32 characters. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    ),

  APP_ORIGIN: z
    .url({ error: 'APP_ORIGIN must be a full URL such as https://example.up.railway.app' })
    .transform((value) => value.replace(/\/+$/, '')),

  OPENAI_API_KEY: optionalString,
  /** Decision D11: gpt-5 needs a verified organisation, so gpt-5.5 is the default for now. */
  OPENAI_MODEL: z.string().default('gpt-5.5'),
  AI_DAILY_CALL_CAP: z.coerce.number().int().positive().default(150),
  /**
   * Decision D16: let the estimator use OpenAI's web search tool to read the label of a
   * named product ("Asda mozzarella sticks"). Searches are billed per call; set `false` to
   * fall back to estimates from memory alone.
   */
  AI_WEB_SEARCH: booleanFlag(true),

  /** Absolute path of the built SPA. Defaults to apps/web/dist relative to the API. */
  WEB_DIST_DIR: optionalString,
})

export type ApiEnv = z.infer<typeof apiEnvSchema>
