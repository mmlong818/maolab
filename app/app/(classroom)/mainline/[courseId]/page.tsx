import { notFound } from 'next/navigation'
import { IMAGE_SCENE_TYPES, auditCourseReleaseReadiness, chromeColorsFor, coursePaletteFor, courseReleaseReason } from '@/lib/mainline'
import { withClassTimeMainlineCastAssets } from '@/lib/mainline/cast-asset-runtime'
import { findMainlineCourse, saveMainlineCourse } from '@/lib/mainline/store'
import { StageCanvas } from '@/components/mainline/StageCanvas'
import { FillBanner } from '@/components/mainline/FillBanner'

export const runtime = 'nodejs'

export default async function MainlineCoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>
}) {
  const { courseId } = await params
  const storedCourse = await findMainlineCourse(courseId)
  if (!storedCourse) return notFound()

  // 先做只读发布判定。被阻断的课程不能因为访问课堂页而触发卡司资产迁移写库。
  const readiness = auditCourseReleaseReadiness(storedCourse)
  let course = storedCourse
  if (readiness.ready) {
    const classTimeCourse = withClassTimeMainlineCastAssets(course)
    if (classTimeCourse !== course) {
      await saveMainlineCourse(classTimeCourse)
      course = classTimeCourse
    }
  }
  const pendingFactAuditIds = course.factAudit?.pendingSceneIds ?? []

  // 配图幕型若都已有 imageUrl → 图完备(白名单单一事实源在 domain)
  const imageTargetsInCourse = course.scenes.filter(s => IMAGE_SCENE_TYPES.includes(s.sceneType))
  const hasImages = imageTargetsInCourse.length > 0 && imageTargetsInCourse.every(s => s.imageUrl)

  if (!readiness.ready) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fcfbf9] px-6 text-[#16181d]">
        <div className="max-w-2xl rounded-[16px] border border-[#e9e6df] border-l-[3px] border-l-[#b23b2e] bg-white p-8 shadow-[0_24px_60px_-34px_rgba(20,22,28,0.35)]">
          <h1 className="text-[28px] font-semibold">
            {readiness.status === 'draft' ? '这节课还是骨架草稿' : `这节课还不能上(${readiness.blockingCount} 个阻断问题)`}
          </h1>
          <p className="mt-3 text-[16px] leading-[1.7] text-[#5b606b]">{course.topic}</p>
          <p className="mt-3 text-[15px] leading-[1.7] text-[#5b606b]">{courseReleaseReason(readiness)}</p>
          {readiness.blockers.length > 0 && <ul className="mt-5 space-y-2 text-[15px] leading-[1.6] text-[#2c2f36]">
            {readiness.blockers.map((blocker, index) => (
              <li key={`${blocker.source}-${blocker.targetId}-${index}`} className="rounded-[10px] border border-[#eadfd9] bg-[#fdf6f4] px-4 py-3">
                <span className="mr-2 rounded-[4px] bg-[#b23b2e] px-2 py-[2px] text-[12px] font-semibold uppercase tracking-[0.06em] text-white">{blocker.gate}</span>
                {blocker.message}
              </li>
            ))}
          </ul>}
          <div className="mt-6">
            <FillBanner
              courseId={courseId}
              qualityStatus={course.qualityStatus}
              hasBlockingIssues={true}
              hasImages={hasImages}
              factAuditPendingCount={pendingFactAuditIds.length}
            />
          </div>
        </div>
      </main>
    )
  }

  // chrome 只依赖 course(pack/mood 都不随 scene 变化),不必为取色造一个假 scene
  const chrome = chromeColorsFor(coursePaletteFor(course))

  return (
    <>
      {/* 放映时这两块随 .classroom-chrome 淡出(见 StageCanvas 的授课放映机制) */}
      <div className="classroom-chrome">
        <FillBanner
          courseId={courseId}
          qualityStatus={course.qualityStatus}
          hasBlockingIssues={false}
          hasImages={hasImages}
          factAuditPendingCount={pendingFactAuditIds.length}
        />
      </div>
      {/* 舞台角标导航:课程库返回 + 备课工作台入口(不破坏沉浸感的小角标) */}
      <div className="classroom-chrome fixed right-3 top-3 z-[100] flex gap-2">
        <a
          href="/mainline"
          className="rounded-[8px] border px-3 py-1.5 text-[13px] font-semibold no-underline transition hover:brightness-110"
          style={{ borderColor: chrome.chipBorder, background: chrome.chipBgFloating, color: chrome.chipText }}
        >
          ← 课程库
        </a>
        <a
          href={`/mainline/${courseId}/prep`}
          className="rounded-[8px] border px-3 py-1.5 text-[13px] font-semibold no-underline transition hover:brightness-110"
          style={{ borderColor: chrome.chipBorder, background: chrome.chipBgFloating, color: chrome.chipText }}
        >
          备课
        </a>
      </div>
      <StageCanvas courses={[course]} />
    </>
  )
}
