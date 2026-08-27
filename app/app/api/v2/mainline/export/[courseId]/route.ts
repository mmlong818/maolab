/**
 * GET /api/v2/mainline/export/[courseId]
 *
 * 教师带走一份 PPTX。2026-08-25 用户裁决:文本框拼装式导出「没有复现应用中的
 * 原样,毫无价值」——改为**逐页截图型导出**:无头浏览器打开授课放映的导出渲染态
 * (?export=1&page=N,与投影画面像素一致,无任何管理浮层),每页整幅进 PPTX,
 * 教师讲稿写入演讲者备注。所见即所得;文字编辑回备课工作台做,再重新导出。
 *
 * 宪法(project-redesign §8.4)不变:只输出已通过质量闸门的课程,本端点只读。
 * 浏览器用系统 Edge(playwright-core channel msedge,无需下载浏览器二进制)。
 */
import { type NextRequest, NextResponse } from 'next/server'
import { chromium } from 'playwright-core'
import PptxGenJS from 'pptxgenjs'
import { findMainlineCourse } from '../../../../../lib/mainline/store.js'
import { auditCourseReleaseReadiness, courseReleaseReason } from '../../../../../lib/mainline/readiness.js'
import { lessonPresentationPages, presentationScene } from '../../../../../lib/mainline/presentation/presentation-pages.js'

export const runtime = 'nodejs'
export const maxDuration = 300

/** 去掉文件名中 Windows/浏览器不允许的字符,避免下载失败。 */
function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '').trim() || 'course'
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params
  const course = await findMainlineCourse(courseId)
  if (!course) return NextResponse.json({ error: 'course not found' }, { status: 404 })

  const readiness = auditCourseReleaseReadiness(course)
  if (!readiness.ready) {
    return NextResponse.json({
      error: 'course not ready for export',
      reason: courseReleaseReason(readiness),
      qualityStatus: readiness.status,
      storedQualityStatus: readiness.storedStatus,
      blockingCount: readiness.blockingCount,
      blockers: readiness.blockers.map(blocker => ({
        source: blocker.source,
        targetId: blocker.targetId,
        message: blocker.message,
      })),
    }, { status: 409 })
  }

  const pages = lessonPresentationPages(course)
  const origin = new URL(req.url).origin

  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true })
    const tab = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })

    const pptx = new PptxGenJS()
    pptx.defineLayout({ name: 'STAGE_16x9', width: 13.333, height: 7.5 })
    pptx.layout = 'STAGE_16x9'
    pptx.title = course.topic

    for (let pageNo = 1; pageNo <= pages.length; pageNo += 1) {
      await tab.goto(`${origin}/mainline/${courseId}?export=1&page=${pageNo}`, { waitUntil: 'networkidle' })
      // 目标页渲染完成的显式信号(StageCanvas 导出态设置)——networkidle 可能先于
      // hydration 达成,不等信号会截到带浮层的第 1 页。
      await tab.waitForFunction(
        (expected: string) => document.body.dataset.exportReady === expected,
        String(pageNo),
        { timeout: 30_000 },
      )
      // 中文 webfont 按 unicode-range 分片懒加载;截图必须等字体真正就绪,
      // 否则前几页会以兜底字体成像(与应用观感不一致)。
      await tab.evaluate(() => document.fonts.ready.then(() => undefined))
      await tab.waitForTimeout(300)
      const shot = await tab.screenshot({ type: 'png' })

      const slide = pptx.addSlide()
      slide.addImage({
        data: `image/png;base64,${shot.toString('base64')}`,
        x: 0, y: 0, w: 13.333, h: 7.5,
      })
      const scene = presentationScene(pages[pageNo - 1]!)
      if (scene.teacherScript.trim()) slide.addNotes(scene.teacherScript.trim())
    }
    await browser.close()
    browser = undefined

    const buffer = await pptx.write({ outputType: 'nodebuffer' }) as Buffer
    const filename = `${sanitizeFilename(course.topic)}.pptx`
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Length': String(buffer.byteLength),
        'Content-Disposition': `attachment; filename="course.pptx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    await browser?.close().catch(() => undefined)
    return NextResponse.json({ error: `export failed: ${String(err)}` }, { status: 500 })
  }
}
