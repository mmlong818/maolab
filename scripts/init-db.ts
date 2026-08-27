import { mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'

const DB_PATH = process.env.DATABASE_URL?.replace('file:', '') ?? './data/maolab.db'
const dir = join(DB_PATH, '..')
mkdirSync(dir, { recursive: true })

const sqlite = new Database(DB_PATH)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

console.log(`[init-db] Creating tables in ${DB_PATH}`)

try {
  sqlite.exec(`
  CREATE TABLE IF NOT EXISTS learner_profiles (
    id TEXT PRIMARY KEY,
    preferred_language TEXT NOT NULL DEFAULT 'zh-CN',
    preferred_style TEXT NOT NULL DEFAULT 'lecture',
    preferred_difficulty TEXT NOT NULL DEFAULT 'intermediate',
    preferred_agent_count INTEGER NOT NULL DEFAULT 2,
    adaptive_state TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS concept_mastery (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    concept_id TEXT NOT NULL,
    score REAL NOT NULL DEFAULT 0,
    last_reviewed_at INTEGER NOT NULL,
    UNIQUE(profile_id, concept_id)
  );

  CREATE TABLE IF NOT EXISTS course_history (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    stage_id TEXT NOT NULL,
    completed_at INTEGER NOT NULL,
    score REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS teaching_plans (
    id TEXT PRIMARY KEY,
    topic TEXT NOT NULL,
    teaching_method TEXT NOT NULL,
    style TEXT NOT NULL,
    language TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    outline TEXT NOT NULL,
    agents TEXT NOT NULL,
    emphasized_concepts TEXT NOT NULL DEFAULT '[]',
    source_documents TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS stages (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'generating',
    scenes TEXT,
    agents TEXT NOT NULL DEFAULT '[]',
    generated_at INTEGER,
    error_message TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_stages_plan ON stages(plan_id);
  CREATE INDEX IF NOT EXISTS idx_mastery_profile ON concept_mastery(profile_id);
  CREATE INDEX IF NOT EXISTS idx_history_profile ON course_history(profile_id);
`)
  console.log('[init-db] Tables created successfully.')

  const migrationsDir = join(process.cwd(), 'packages/db/src/migrations')
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql') && !f.startsWith('0000_'))
    .sort()
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8')
    const statements = sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean)
    console.log(`[init-db] Applying migration ${file} (${statements.length} statements)`)
    for (const stmt of statements) {
      try {
        sqlite.exec(stmt)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('duplicate column name') || msg.includes('already exists')) {
          continue
        }
        throw err
      }
    }
  }
  console.log('[init-db] Migrations applied.')
} finally {
  sqlite.close()
}
