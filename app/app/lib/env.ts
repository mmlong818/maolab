function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val?.trim()) {
    throw new Error(
      `[env] Missing required environment variable: ${key}\n` +
      `Check .env.example for the full list of required variables.`,
    )
  }
  return val
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue
}

export const env = {
  DATABASE_URL: optionalEnv('DATABASE_URL', 'file:./data/maolab.db'),
  OPENAI_API_KEY: requireEnv('OPENAI_API_KEY'),
  OPENAI_MODEL: optionalEnv('OPENAI_MODEL', 'gpt-4o-mini'),
  OPENAI_BASE_URL: optionalEnv('OPENAI_BASE_URL', 'https://api.openai.com'),
  NODE_ENV: optionalEnv('NODE_ENV', 'development'),
}
