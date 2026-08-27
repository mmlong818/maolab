import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema.js'

export type DbClient = ReturnType<typeof createDb>

export function createDb(url: string) {
  const sqlite = new Database(url.replace('file:', ''))
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  return drizzle(sqlite, { schema })
}

/** 返回原始 better-sqlite3 句柄（脚本/repo CRUD 用） */
export function openSqliteRaw(path: string): Database.Database {
  const sqlite = new Database(path.replace('file:', ''))
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  return sqlite
}
