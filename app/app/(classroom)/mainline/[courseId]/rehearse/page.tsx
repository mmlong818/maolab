import Link from 'next/link'
import { notFound } from 'next/navigation'
import { RehearsalRoom } from '@/components/mainline/rehearsal/RehearsalRoom'
import { auditCourseReleaseReadiness, courseReleaseReason } from '@/lib/mainline'
import { fetchKpMetadata } from '@/lib/mainline/kp-metadata'
import type { MasteryRecord } from '@/lib/mainline/mastery'
import { masteryRecordsOf } from '@/lib/mainline/mastery-store'
import { rehearseCourse } from '@/lib/mainline/rehearsal/engine'
import { findMainlineCourse } from '@/lib/mainline/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function RehearsalPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>
  searchParams: Promise<{ scenario?: string | string[] }>
}) {
  const { courseId } = await params
  const query = await searchParams
  const requestedScenario = Array.isArray(query.scenario) ? query.scenario[0] : query.scenario
  const scenario = requestedScenario === 'self-study' ? 'self-study' : 'teacher'
  const course = await findMainlineCourse(courseId)
  if (!course) return notFound()

  const readiness = auditCourseReleaseReadiness(course)
  if (!readiness.ready) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f7f4] px-6 text-[#17191d]">
        <section className="w-full max-w-xl border border-[#deded8] bg-white p-8 shadow-[0_18px_50px_-40px_rgba(20,22,28,0.5)]">
          <p className="text-[12px] font-semibold text-[#8b5d22]">排练暂不可用</p>
          <h1 className="mt-2 text-[26px] font-semibold">先完成课程质量检查</h1>
          <p className="mt-3 text-[15px] leading-7 text-[#62656d]">
            {courseReleaseReason(readiness)}排练只读取当前检查真正通过的课程，避免把未完成内容当成课堂表现结论。
          </p>
          <div className="mt-6 flex gap-3">
            <Link className="rounded-[6px] bg-[#17191d] px-4 py-2 text-[14px] font-semibold text-white no-underline" href={'/mainline/' + course.id + '/prep'}>返回备课</Link>
            <Link className="rounded-[6px] border border-[#d7d7d1] px-4 py-2 text-[14px] font-semibold text-[#3d4047] no-underline" href="/mainline">课程库</Link>
          </div>
        </section>
      </main>
    )
  }

  const kpIds = [...new Set(course.scenes.flatMap(scene => scene.kpId ? [scene.kpId] : []))]
  const mastery = new Map<string, number>()
  let masteryRecords = new Map<string, MasteryRecord>()
  try {
    masteryRecords = await masteryRecordsOf(kpIds)
    for (const [kpId, record] of masteryRecords) {
      if (record.evidenceStatus !== 'legacy-unattributed') mastery.set(kpId, record.score)
    }
  } catch {
    // 学情库或来源台账不可用时保持证据为空，引擎会少产出而不是编造。
  }

  let knownMisconceptions: Map<string, readonly string[]> | undefined
  try {
    const metadata = await fetchKpMetadata(kpIds)
    knownMisconceptions = new Map(kpIds.flatMap(kpId => {
      const kp = metadata.get(kpId)
      return kp ? [[kpId, kp.misconceptions ?? []] as const] : []
    }))
  } catch {
    // 教材索引不可用时回退课程自身的溯源字段；引擎仍只报告有证据的问题。
  }

  const report = rehearseCourse(course, mastery, scenario, knownMisconceptions)
  const misconceptionsByKp = knownMisconceptions
    ? Object.fromEntries([...knownMisconceptions].map(([kpId, items]) => [kpId, [...items]]))
    : {}
  return (
    <RehearsalRoom
      course={course}
      report={report}
      scenario={scenario}
      misconceptionsByKp={misconceptionsByKp}
      masteryCoverage={{
        used: mastery.size,
        total: kpIds.length,
        statusByKp: Object.fromEntries([...masteryRecords].map(([kpId, record]) => [kpId, record.evidenceStatus])),
      }}
    />
  )
}
