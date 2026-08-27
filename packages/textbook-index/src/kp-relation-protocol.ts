/**
 * KP 关系推断的「LLM ↔ 本地」标识协议(2026-07-28)
 *
 * ## 为什么单独成模块
 *
 * 这三个函数原先写在 `scripts/infer-kp-relations-llm.ts` 里,无法单测。
 * 而它们静默失败了一整轮:高中数学 711 个 KP 跑完,**入库 0 条**,
 * 脚本却把该组标记为「已完成」。放在 src/ 才能用假数据把这类失败钉住。
 *
 * ## 协议:用行号,不用 UUID
 *
 * 原做法把完整 UUID 列给 LLM,再要它原样吐回来当 from/to。80 个 KP 一批、
 * 期望输出 20–60 条关系 ⇒ 要逐字复述上百个 36 位 UUID。两个后果同时发生:
 *
 * | 后果 | 实测 |
 * |---|---|
 * | 输出过长撞 CLI 超时 | 9 批里 **6 批** 120s 超时 |
 * | 抄错一个字符即被 `validIds` 判否、静默丢弃 | 唯一跑通的批输出 62 条,**可用 0 条** |
 *
 * 行号把标识从 36 字符压到 1–2 字符:输出 token 大减,且「抄错」会落在合法区间外
 * 被**显式拒绝并计数**,而不是变成一条看不见的丢弃。
 */

export interface KpLike {
  id: string
  canonical_name: string
}

/**
 * 「范围过滤 + 默认全局清空」这个组合必须在**代码层**拦掉,不能只靠注释(2026-07-28)。
 *
 * `clearRelationsBySource(db,'llm-inferred')` 在范围过滤之前执行、不受
 * `--limit-subjects` / `--limit-grade-bands` 约束。于是
 * `--limit-subjects=数学` 会先删光**所有学科**的边,再只重建数学。
 *
 * 上一版我在文件头写了「❌ --limit-subjects=数学」的警告就收工了。
 * **自己标了 ❌ 还让它能跑,等于把危险留给下一个不读注释的人**——这跟我在
 * seed-mastery 里给会删真实作答的命令起名 `--clear` 是同一个错误,
 * 同一天犯第三次。守卫必须是代码。
 *
 * 两条安全出路都在返回的 reason 里写清楚,不让用户自己猜。
 */
export function clearSafetyVerdict(args: {
  limitSubjects: readonly string[] | null
  limitGradeBands: readonly string[] | null
  noClear: boolean
}): { ok: true } | { ok: false; reason: string } {
  const scoped: string[] = []
  if (args.limitSubjects?.length) scoped.push(`--limit-subjects=${args.limitSubjects.join(',')}`)
  if (args.limitGradeBands?.length) scoped.push(`--limit-grade-bands=${args.limitGradeBands.join(',')}`)
  if (scoped.length === 0 || args.noClear) return { ok: true }
  return {
    ok: false,
    reason: [
      `拒绝执行:指定了范围过滤(${scoped.join(' ')})却未加 --no-clear。`,
      '默认的清空是**全局**的、且发生在范围过滤之前——这样跑会先删光所有学科的',
      "source='llm-inferred' 关系边,再只重建你指定的那个子集,其余静默丢失。",
      '',
      '要增量补某个范围:  加 --no-clear(已完成的组由 kp_rel_progress 跳过)',
      '要全量重建:        去掉所有 --limit-* 参数',
    ].join('\n'),
  }
}

export type KpRelationTypeLike = string

export interface LlmRelRaw {
  from: number
  to: number
  type: KpRelationTypeLike
  evidence: string
}

export interface ResolvedRel {
  from: string
  to: string
  type: KpRelationTypeLike
  evidence: string
}

/** 给 LLM 看的清单:`  1: 向量的概念`。行号 1-based。 */
export function buildIndexedList(kps: readonly KpLike[]): string {
  return kps.map((k, i) => `  ${i + 1}: ${k.canonical_name}`).join('\n')
}

/**
 * 从 LLM 回复里抠出 JSON 数组并归一化。
 * from/to 接受整数或纯数字字符串(模型常把数字包成字符串),其余一律丢弃。
 */
export function extractJsonArray(text: string): LlmRelRaw[] {
  const m = text.trim().match(/\[[\s\S]*\]/)
  if (!m) return []
  const num = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isInteger(v)) return v
    if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number.parseInt(v.trim(), 10)
    return null
  }
  try {
    const arr = JSON.parse(m[0]) as Array<Record<string, unknown>>
    if (!Array.isArray(arr)) return []
    const out: LlmRelRaw[] = []
    for (const r of arr) {
      if (!r || typeof r.type !== 'string') continue
      const from = num(r.from)
      const to = num(r.to)
      if (from === null || to === null) continue
      out.push({
        from,
        to,
        type: r.type,
        evidence: typeof r.evidence === 'string' ? r.evidence.slice(0, 100) : '',
      })
    }
    return out
  } catch {
    return []
  }
}

/**
 * 行号 → KP id。越界与自指丢弃并计数——**计数是关键**:
 * 上一版的丢弃是无声的,于是「62 条输出、0 条可用」被当成了正常完成。
 *
 * 跨学科场景 from/to 属于两个不同的行号空间,故 fromPool / toPool 分开传。
 */
export function resolveIndices(
  raw: readonly LlmRelRaw[],
  fromPool: readonly KpLike[],
  toPool: readonly KpLike[],
): { rels: ResolvedRel[]; outOfRange: number } {
  const rels: ResolvedRel[] = []
  let outOfRange = 0
  for (const r of raw) {
    const a = fromPool[r.from - 1]
    const b = toPool[r.to - 1]
    if (!a || !b || a.id === b.id) {
      outOfRange++
      continue
    }
    rels.push({ from: a.id, to: b.id, type: r.type, evidence: r.evidence })
  }
  return { rels, outOfRange }
}
