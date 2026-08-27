import type { Config } from 'drizzle-kit'

export default {
  schema: './src/schema.ts',
  out: './src/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'file:./data/maolab.db',
  },
} satisfies Config
