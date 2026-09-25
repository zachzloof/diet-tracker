import { apiEnvSchema, type ApiEnv } from '@diet-tracker/shared'
import { loadDotEnv } from './dotenv.js'

loadDotEnv()

function parse(): ApiEnv {
  const result = apiEnvSchema.safeParse(process.env)
  if (result.success) return result.data
  const lines = result.error.issues.map(
    (issue) => `  ${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`,
  )
  console.error(
    `Invalid environment:\n${lines.join('\n')}\nSee apps/api/.env.example for the contract.`,
  )
  return process.exit(1)
}

export const env: ApiEnv = parse()
export const isProduction = env.NODE_ENV === 'production'
