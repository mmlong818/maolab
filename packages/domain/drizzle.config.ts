import { defineConfig } from 'drizzle-kit'
export default defineConfig({ dialect: 'postgresql', schema: ['./src/schema/course.ts'], out: './migrations' })
