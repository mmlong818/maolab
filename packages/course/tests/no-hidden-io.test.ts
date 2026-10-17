import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const SRC = fileURLToPath(new URL('../src/', import.meta.url))
const SOURCE_EXT = /\.(ts|tsx|mts|cts)$/ // src 里目前只有 .ts；其余扩展名一并扫，免得日后新增文件漏过

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : walk(path)
    return SOURCE_EXT.test(path) ? [path] : []
  })
}

// 模块说明符：单引号或双引号（import/from/动态 import()/require()）
const Q = `['"\`]`
const spec = (names: string) => `(?:from\\s*|import\\s*\\(\\s*|require\\s*\\(\\s*|import\\s+)${Q}(?:${names})${Q}`

type Rule = { re: RegExp; why: string; allow?: (rel: string) => boolean }

// 只匹配 import / 调用 / 标识符形态，避免迁入文件注释里提到这些名字时误报
const FORBIDDEN: Rule[] = [
  { re: new RegExp(`${spec('@maolab/db|(?:node:)?sqlite|better-sqlite3')}|openSqliteRaw\\(|new\\s+(?:Database|DatabaseSync)\\(`), why: 'SQLite' },
  { re: new RegExp(`${spec('@maolab/llm-shared|(?:node:)?child_process')}|runClaudeCli\\(`), why: '命令行子进程' },
  { re: new RegExp(`${spec('playwright(?:-core)?')}`), why: '浏览器（归 workers/render）' },
  { re: /buildPollinationsUrl\(|image\.pollinations\.ai/, why: '公共图像服务' },
  { re: /process\.env\.[A-Z_]*(API_KEY|_KEY|TOKEN|SECRET|DATABASE_URL|BASE_URL|_MODEL)\b/, why: '环境变量里的模型或数据库配置' },
  // fetch 作为标识符出现：fetch(...)、typeof fetch、?? fetch、const f = fetch、globalThis.fetch。
  // 前后不得是单词字符或 $，所以 prefetch、fetchKpMetadata 不命中；前面是 . 的成员调用（client.fetch）也不命中，
  // 但 globalThis/window/self/global 上的 fetch 单独列出。
  { re: /(?<![\w$.])fetch(?![\w$])|(?<![\w$])(?:globalThis|window|self|global)\s*\.\s*fetch(?![\w$])/, why: '直接出网', allow: (rel) => rel.startsWith('transports/') },
  { re: new RegExp(`${spec('(?:node:)?fs(?:/promises)?')}`), why: '文件系统' },
  { re: /process\.env\b|process\.cwd\(/, why: '进程环境与工作目录' },
  { re: /\b(masteryRecordsOf|masteryRecordOf|recentMistakesForKps|recordPracticeAttempt|listWeakKps|seededMasteryKpIds|savedPracticeSceneIds)\(/, why: '学生学情读写' },
]

function scan(rel: string, text: string): string[] {
  return FORBIDDEN.filter((rule) => !rule.allow?.(rel) && rule.re.test(text)).map((rule) => `${rel}: ${rule.why}`)
}

// 显式放行：按"文件 + 规则"逐条列出，不放宽上面的规则。
// 命中不在表里就失败；表里的项不再命中也失败（防止白名单悄悄过期）。
const ALLOWED: Record<string, Array<{ why: string; reason: string }>> = {
  // 3a 迁入时已知仍含隐藏 I/O 的原样迁入文件（fill-images 写进程目录已在 3b Task 1 修掉）；剩下的各自写明归属
  'education-resources/catalog.ts': [
    { why: '文件系统', reason: 'D9 / 阶段 6：读资源目录' },
    { why: '进程环境与工作目录', reason: 'D9 / 阶段 6：MAOLAB_EDUCATION_RESOURCES_ROOT 与 cwd' },
  ],
  'mainline/generation/fact-repair.ts': [{ why: '进程环境与工作目录', reason: '原样迁入：只读重试次数上限 MAOLAB_FACT_REPAIR_MAX_ATTEMPTS（夹在 0..3，不含凭据）；改为注入随 3c 工具接入再定' }],
  // 3b 裁决：cowart 改图属 D5 不迁，本仓库无调用方；该函数只判定地址、不出网；worker 拦截一切外网请求，残留图片按坏图被门禁拦下
  'mainline/image-edit/cowart.ts': [{ why: '公共图像服务', reason: '3b：死代码地址判定，见计划已定事实' }],
  // 误报
  'mainline/generation-page-runner.ts': [{ why: '直接出网', reason: '误报：fetch 只出现在判断错误信息的正则字面量里' }],
}

test('the course package does no hidden I/O and reads no global credentials', () => {
  const hits: string[] = []
  for (const file of walk(SRC)) {
    const rel = relative(SRC, file).replaceAll('\\', '/')
    hits.push(...scan(rel, readFileSync(file, 'utf8')))
  }
  const allowed = Object.entries(ALLOWED).flatMap(([rel, items]) => items.map((item) => `${rel}: ${item.why}`))
  expect(hits.filter((hit) => !allowed.includes(hit))).toEqual([])
  expect(allowed.filter((hit) => !hits.includes(hit))).toEqual([])
})

test('allowlisted files still exist', () => {
  const rels = new Set(walk(SRC).map((file) => relative(SRC, file).replaceAll('\\', '/')))
  for (const rel of Object.keys(ALLOWED)) expect(rels.has(rel), `${rel} 已不存在，请从白名单移除`).toBe(true)
})

test('the scan rules catch their cases and skip the known safe identifiers', () => {
  const caught = (text: string, rel = 'x.ts') => scan(rel, text).map((hit) => hit.split(': ')[1])
  // 命中：两种引号、有无 node: 前缀、动态 import / require
  expect(caught(`import fs from "node:fs"`)).toContain('文件系统')
  expect(caught(`import fs from 'fs'`)).toContain('文件系统')
  expect(caught(`const m = await import('node:fs/promises')`)).toContain('文件系统')
  expect(caught(`const fs = require("fs")`)).toContain('文件系统')
  expect(caught(`import { exec } from "child_process"`)).toContain('命令行子进程')
  expect(caught(`import { exec } from 'node:child_process'`)).toContain('命令行子进程')
  expect(caught(`await import("node:child_process")`)).toContain('命令行子进程')
  expect(caught(`const cp = require('child_process')`)).toContain('命令行子进程')
  expect(caught(`import Database from "better-sqlite3"`)).toContain('SQLite')
  expect(caught(`const D = require('better-sqlite3')`)).toContain('SQLite')
  expect(caught(`import { DatabaseSync } from 'node:sqlite'`)).toContain('SQLite')
  expect(caught(`const db = new Database(path)`)).toContain('SQLite')
  expect(caught(`import { db } from "@maolab/db"`)).toContain('SQLite')
  expect(caught(`await import("playwright")`)).toContain('浏览器（归 workers/render）')
  expect(caught(`const host = 'image.pollinations.ai'`)).toContain('公共图像服务')
  // fetch：调用、别名、引用、全局成员
  expect(caught(`await fetch(url)`)).toContain('直接出网')
  expect(caught(`const f = fetch`)).toContain('直接出网')
  expect(caught(`const f = cfg.impl ?? fetch`)).toContain('直接出网')
  expect(caught(`const f: typeof fetch = x`)).toContain('直接出网')
  expect(caught(`globalThis.fetch(url)`)).toContain('直接出网')
  expect(caught(`const g = globalThis . fetch`)).toContain('直接出网')
  expect(caught(`fetch(url)`, 'transports/openai-compat.ts')).toEqual([])
  // 不命中：相近标识符与注释里的名字
  expect(caught(`prefetch(url)`)).toEqual([])
  expect(caught(`const x = await fetchKpMetadata(id)`)).toEqual([])
  expect(caught(`refetch(); fetch_count++; client.fetch(a)`)).toEqual([])
  expect(caught(`const sqliteNote = 'uses sqlite'; // better-sqlite3 mentioned in a comment`)).toEqual([])
  expect(caught(`import { z } from 'zod'`)).toEqual([])
})

test('the five deleted singletons and the season store are gone', () => {
  const all = walk(SRC).map((file) => readFileSync(file, 'utf8')).join('\n')
  for (const name of ['generationPageRunner', 'generationCourseAuditor', 'generationSessionService', 'teacherAcceptanceService', 'generationRenderRunner']) {
    expect(all).not.toMatch(new RegExp(`export const ${name}\\b`))
  }
  expect(walk(SRC).some((file) => file.endsWith('season-store.ts'))).toBe(false)
})
