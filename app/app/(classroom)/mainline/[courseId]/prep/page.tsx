import { notFound, redirect } from 'next/navigation'
import { auditMainlineCourse, summarizeQuality, type MainlineCourse } from '@/lib/mainline'
import { findMainlineCourse } from '@/lib/mainline/store'
import { buildPrepBriefForCourse, type PrepBrief } from '@/lib/mainline/prep-brief'
import { PrepWorkbench } from '@/components/mainline/workbench/PrepWorkbench'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * /mainline/[courseId]/prep · v5 M1 备课工作台入口(server component,纯取数据)
 *
 * 与课堂播放器页(`/mainline/[courseId]`)的关键差异:这里**不**调用
 * withClassTimeMainlineCastAssets——那是"进教室上课"按真实时间锁定立绘矩阵切片的
 * 逻辑,备课不等于上课(老师可能提前一晚备课),工作台预览应该照 course 里已落库的
 * castAssetSelection 原样展示,不做课堂时间锁定。
 */
export default async function MainlinePrepPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>
  searchParams: Promise<{ scene?: string | string[]; misconception?: string | string[] }>
}) {
  const { courseId } = await params
  const query = await searchParams
  const requestedSceneId = Array.isArray(query.scene) ? query.scene[0] : query.scene
  const requestedMisconception = Array.isArray(query.misconception) ? query.misconception[0] : query.misconception
  const course = await findMainlineCourse(courseId)
  if (!course) return notFound()

  if (course.planning && (!course.pageContent || ['planning', 'plan-approved', 'generating'].includes(course.planning.status))) {
    redirect(`/mainline/${courseId}/plan`)
  }

  // 新版课程由页面正文门禁负责，不能再拿旧 scenes 的骨架槽位给教师制造无关阻断。
  const issues = course.pageContent ? [] : auditMainlineCourse(course)
  const summary = summarizeQuality(issues)
  const factAuditIssues = course.factAudit?.issues ?? []
  const factAuditFatalCount = factAuditIssues.filter(i => i.severity === 'blocking').length
  // round13 真检发现:misleading/imprecise 断言(如例题把"借物喻人"讲成"借物抒情")
  // 完全不出现在检查 tab——之前只有 FATAL 计数走了旁路提示,warning/info 被静默吞掉,
  // 5 分钟判断"这课能不能上"时会漏看真实内容错误。按 FATAL banner 同款模式补上。
  const factAuditWarningCount = factAuditIssues.filter(i => i.severity === 'warning').length
  const factAuditInfoCount = factAuditIssues.filter(i => i.severity === 'info').length

  let prepBrief: PrepBrief | undefined
  let prepBriefError = false
  try {
    prepBrief = await buildPrepBriefForCourse(courseId)
  } catch {
    prepBriefError = true
  }

  const fragmentLabels = buildFragmentLabels(course, prepBrief)

  return (
    <PrepWorkbench
      course={course}
      issues={issues}
      summary={summary}
      factAuditFatalCount={factAuditFatalCount}
      factAuditWarningCount={factAuditWarningCount}
      factAuditInfoCount={factAuditInfoCount}
      prepBrief={prepBrief}
      prepBriefError={prepBriefError}
      fragmentLabels={fragmentLabels}
      {...(requestedSceneId ? { initialSelectedSceneId: requestedSceneId } : {})}
      {...(requestedMisconception ? { initialRequestedMisconception: requestedMisconception } : {})}
    />
  )
}

/**
 * 片段 id → 结构树展示标签。KP 片段直接取 PrepBrief 已经组装好的 teachingType
 * (骨架库口径,零重复计算);课级片段(开场/收束)没有 skeletonRationale 条目,
 * 按其首个场景的 sceneType 兜底命名。
 */
function buildFragmentLabels(course: MainlineCourse, prepBrief: PrepBrief | undefined): Record<string, string> {
  const byFragmentId = new Map((prepBrief?.skeletonRationale ?? []).map(r => [r.fragmentId, r.teachingType]))
  const labels: Record<string, string> = {}
  for (const fragment of course.learningFragments) {
    const fromBrief = byFragmentId.get(fragment.id)
    if (fromBrief) {
      labels[fragment.id] = fromBrief
      continue
    }
    const firstScene = course.scenes.find(s => s.id === fragment.sceneIds[0])
    labels[fragment.id] = firstScene?.sceneType === 'recap' ? '收束' : firstScene?.sceneType === 'source-reading' ? '开场' : '课级片段'
  }
  return labels
}
