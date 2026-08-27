#!/usr/bin/env tsx
import { openSqliteRaw } from '@maolab/db'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
;(globalThis as { require?: NodeRequire }).require ??= createRequire(import.meta.url)
const DB = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'data', 'maolab.db')
const db = openSqliteRaw(DB)
const total = (db.prepare('SELECT COUNT(*) n FROM kp_relations').get() as any).n
const byType = db.prepare('SELECT relation_type, COUNT(*) n FROM kp_relations GROUP BY relation_type').all() as any[]
console.log('kp_relations 总数:', total)
byType.forEach(r => console.log(' ', r.relation_type, ':', r.n))
db.close()
