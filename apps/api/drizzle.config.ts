import { defineConfig } from 'drizzle-kit'
import { resolve } from 'node:path'
import { loadDotEnv } from './src/dotenv.js'

loadDotEnv(resolve(process.cwd(), '.env'))

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set; copy .env.example to .env first')

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url },
  strict: true,
  verbose: true,
})
