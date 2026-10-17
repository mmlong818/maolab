/**
 * 4a：课程 → 发布草稿（纯函数，不读写存储，不调模型）。
 * 判定与导出同一个：auditCourseReleaseReadiness（质量闸门、事实核查、正文与截图证据、AI 教学审查、教师逐页验收的最终签名都对得上当前正文）。
 * 另加三条（控制器裁决 F1、F5）：没有页面规划的课程（例如导入的 maolab 旧课，走不了逐页验收）、缺最终签名的课程、已被新修订取代的课程，一律 not-ready。
 * 迁入代码里的 teacherAcceptanceService.publish 是"整课验收"，与这里的"发布到公共库"无关（阶段 3 总览不一致第 2 条），本文件不调用它。
 * 快照 = 课程的深拷贝去掉备课过程数据（PUBLICATION_STRIPPED_FIELDS，以及 planning 里的 PUBLICATION_STRIPPED_PLANNING_FIELDS）；剥离不改变 lessonPresentationPages（测试锁住）。
 * 课程 JSON 里没有老师账号字段（归属在存储层）；剥掉的过程数据里含老师的修改意见与产物地址。
 * 图片地址的复制与改写、隐私扫描在 @maolab/domain 的 PgPublications.publish 里做（它持有产物与账号数据），那是兜底，不是这里的替代。
 */
import type { MainlineCourse } from '../mainline/domain.js'
import { lessonPresentationPages } from '../mainline/presentation/presentation-pages.js'
import { auditCourseReleaseReadiness, courseReleaseReason } from '../mainline/readiness.js'

/** 备课过程数据：生成会话（诊断、老师的修改意见）、截图证据（老师的产物地址）、整课审计、AI 教学审查、事实核查留痕、验收记录、修订关系、课程季 */
export const PUBLICATION_STRIPPED_FIELDS = ['generationSession', 'pageRenderEvidence', 'generationCourseAudit', 'teachingQualityAudit', 'factAudit', 'teacherAcceptance', 'revision', 'season'] as const
/** planning 里的修订关系（终审 M1）：修订版的 basedOnPlanRevisionId 是 `<旧课程 id>:plan:N`，带着老师另一门课的 id，与剥掉 revision 同理 */
export const PUBLICATION_STRIPPED_PLANNING_FIELDS = ['basedOnPlanRevisionId'] as const
/** 教材候选资源里的出处链接（复审 D9）：外部网址，引用字段校验（终审 M2）不收；它只是来源说明，页面渲染只用 assetUrl。
 *  candidateResources 本身不能剥：页面没有生成图时 pageImageUrl 用候选的 assetUrl 当页图，剥掉会改变孩子看到的页面（测试锁住） */
export const PUBLICATION_STRIPPED_CANDIDATE_FIELDS = ['sourceUrl'] as const

export type PublicationDraftResult =
  | { ok: true; draft: { familyId: string; signature: string; title: string; subject: string; gradeBand: string; kpIds: string[]; pageCount: number; snapshot: MainlineCourse } }
  | { ok: false; reason: 'not-ready' | 'no-knowledge-point'; message: string; blockers?: Array<{ source: string; targetId: string; message: string }> }

/** 课程关联的知识点：sourceMaterial 的 kpId 去重保序，再补 scenes 的 kpId */
export function kpIdsOf(course: MainlineCourse): string[] {
  const out: string[] = []
  const add = (id: unknown): void => { if (typeof id === 'string' && id.trim() && !out.includes(id)) out.push(id) }
  for (const material of course.sourceMaterial ?? []) add(material.kpId)
  for (const scene of course.scenes ?? []) add((scene as { kpId?: unknown }).kpId)
  return out
}

export function publicationDraftOf(course: MainlineCourse): PublicationDraftResult {
  if (!course.planning) {
    return { ok: false, reason: 'not-ready', message: '这门课没有页面规划（例如导入的旧课），无法逐页验收，不能发布。' }
  }
  if (course.revision?.supersededByCourseId) {
    return { ok: false, reason: 'not-ready', message: '这门课已被新的修订版本取代，请发布最新版本。' }
  }
  // 知识点先于可发布判定：页面引用的来源 id 带着 kpId，去掉 kpId 本身就会让判定失败（实测），放在后面 no-knowledge-point 永远到不了
  const kpIds = kpIdsOf(course)
  if (kpIds.length === 0) return { ok: false, reason: 'no-knowledge-point', message: '课程没有关联任何知识点，孩子无法按知识点找到它。' }
  const readiness = auditCourseReleaseReadiness(course)
  if (!readiness.ready) {
    return {
      ok: false, reason: 'not-ready',
      message: courseReleaseReason(readiness) ?? '课程还没有通过整课验收（或验收后又改过），不能发布。',
      blockers: readiness.blockers.map((b) => ({ source: b.source, targetId: b.targetId, message: b.message })),
    }
  }
  const signature = course.teacherAcceptance?.finalSignature
  if (!signature) return { ok: false, reason: 'not-ready', message: '课程缺少教师整课验收的最终签名，不能发布。' }
  const snapshot = structuredClone(course) as MainlineCourse & Record<string, unknown>
  for (const field of PUBLICATION_STRIPPED_FIELDS) delete snapshot[field]
  if (snapshot.planning) for (const field of PUBLICATION_STRIPPED_PLANNING_FIELDS) delete (snapshot.planning as unknown as Record<string, unknown>)[field]
  for (const source of snapshot.sourceMaterial ?? []) {
    for (const resource of source.candidateResources ?? []) for (const field of PUBLICATION_STRIPPED_CANDIDATE_FIELDS) delete (resource as unknown as Record<string, unknown>)[field]
  }
  return {
    ok: true,
    draft: {
      familyId: course.revision?.familyId ?? course.id,
      signature,
      title: course.topic,
      subject: course.subject,
      gradeBand: course.gradeBand,
      kpIds,
      pageCount: lessonPresentationPages(course).length,
      snapshot,
    },
  }
}
