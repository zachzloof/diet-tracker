import { z } from 'zod'

/** Treat an empty string as "not set" so `KEY=` lines in .env behave like a missing var. */
const optionalString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().optional(),
)

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
  OPENAI_MODEL: z.string().default('gpt-5'),
  AI_DAILY_CALL_CAP: z.coerce.number().int().positive().default(150),

  /** Absolute path of the built SPA. Defaults to apps/web/dist relative to the API. */
  WEB_DIST_DIR: optionalString,
})

export type ApiEnv = z.infer<typeof apiEnvSchema>
