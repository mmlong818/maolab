import type { SearchQuery, TextbookEntry, TextbookIndex } from './types.js'

export function searchTextbooks(index: TextbookIndex, q: SearchQuery): TextbookEntry[] {
  return index.entries.filter(e => {
    if (q.stage && e.stage !== q.stage) return false
    if (q.subject && e.subject !== q.subject) return false
    if (q.version && e.version !== q.version) return false
    if (q.grade && e.grade !== q.grade) return false
    if (q.volume && e.volume !== q.volume) return false
    if (q.q && !e.title.includes(q.q)) return false
    return true
  })
}

/** 列出每个维度的可选值 (用于级联下拉) */
export function listFacets(index: TextbookIndex): {
  stages: string[]
  subjects: Record<string, string[]>   // stage -> subjects
  versions: Record<string, string[]>   // stage|subject -> versions
  grades: Record<string, string[]>     // stage|subject|version -> grades
  volumes: Record<string, string[]>    // stage|subject|version|grade -> volumes
} {
  const stages = new Set<string>()
  const subjects: Record<string, Set<string>> = {}
  const versions: Record<string, Set<string>> = {}
  const grades: Record<string, Set<string>> = {}
  const volumes: Record<string, Set<string>> = {}
  for (const e of index.entries) {
    stages.add(e.stage)
    const sk = e.stage
    const sjk = `${e.stage}|${e.subject}`
    const vk = `${sjk}|${e.version}`
    const gk = `${vk}|${e.grade}`
    ;(subjects[sk] ??= new Set()).add(e.subject)
    ;(versions[sjk] ??= new Set()).add(e.version)
    ;(grades[vk] ??= new Set()).add(e.grade)
    ;(volumes[gk] ??= new Set()).add(e.volume)
  }
  const toSorted = (s: Set<string>) => Array.from(s).sort()
  return {
    stages: toSorted(stages),
    subjects: Object.fromEntries(Object.entries(subjects).map(([k, v]) => [k, toSorted(v)])),
    versions: Object.fromEntries(Object.entries(versions).map(([k, v]) => [k, toSorted(v)])),
    grades: Object.fromEntries(Object.entries(grades).map(([k, v]) => [k, toSorted(v)])),
    volumes: Object.fromEntries(Object.entries(volumes).map(([k, v]) => [k, toSorted(v)])),
  }
}
