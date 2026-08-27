/**
 * POST /api/v2/mainline/response · v4 M3 学情闭环入口
 *
 * practice 幕在揭晓答案前记录把握度，反馈后自评结果；作答证据和暂定 KP 掌握度
 * 在同一事务内落库。自评不会写入客观 correct 列，响应明确返回 provisional 状态。
 */
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  isWeakMastery,
  PRACTICE_EVIDENCE_MAX_LENGTH,
  practiceObjectiveCriteria,
  practiceReflectionQualityReason,
} from '../../../../lib/mainline/mastery.js'
import { recordPracticeAttempt, savedPracticeSceneIds } from '../../../../lib/mainline/mastery-store.js'
import { findMainlineCourse } from '../../../../lib/mainline/store.js'

export const runtime = 'nodejs'

const RequestSchema = z.object({
  courseId: z.string().min(1),
  sessionId: z.string().trim().min(8).max(100).regex(/^[A-Za-z0-9_-]+$/),
  sceneId: z.string().min(1),
  kpId: z.string().min(1),
  practiceSnapshot: z.object({
    task: z.string().trim().min(1),
    feedback: z.string().trim().min(1),
  }).strict(),
  outcome: z.enum(['correct', 'incorrect']),
  confidence: z.enum(['low', 'medium', 'high']),
  attemptText: z.string().trim().min(1).max(PRACTICE_EVIDENCE_MAX_LENGTH),
  reflectionText: z.string().trim().min(1).max(PRACTICE_EVIDENCE_MAX_LENGTH),
})

export async function GET(req: NextRequest) {
  const courseId = req.nextUrl.searchParams.get('courseId')?.trim()
  const sessionId = req.nextUrl.searchParams.get('sessionId')?.trim()
  if (!courseId || !sessionId || !/^[A-Za-z0-9_-]{8,100}$/.test(sessionId)) {
    return NextResponse.json({ error: 'courseId and valid sessionId are required' }, { status: 400 })
  }
  const course = await findMainlineCourse(courseId)
  if (!course) return NextResponse.json({ error: 'course not found' }, { status: 404 })
  const practiceScenes = course.scenes
    .filter(scene => scene.sceneType === 'practice' && scene.kpId)
    .map(scene => ({
      sceneId: scene.id,
      task: scene.contentSlots.task?.trim() ?? '',
      feedback: scene.contentSlots.feedback?.trim() ?? '',
    }))
    .filter(scene => scene.task && scene.feedback)
  const savedSceneIds = await savedPracticeSceneIds(courseId, sessionId, practiceScenes)
  return NextResponse.json({ savedSceneIds })
}

export async function POST(req: NextRequest) {
  let body: z.infer<typeof RequestSchema>
  try { body = RequestSchema.parse(await req.json()) }
  catch (err) { return NextResponse.json({ error: `Invalid request body: ${String(err)}` }, { status: 400 }) }

  // 作答必须锚定真实课程的真实幕(防脏数据入学情)
  const course = await findMainlineCourse(body.courseId)
  if (!course) return NextResponse.json({ error: 'course not found' }, { status: 404 })
  const scene = course.scenes.find(s => s.id === body.sceneId)
  if (!scene || scene.sceneType !== 'practice' || scene.kpId !== body.kpId) {
    return NextResponse.json({ error: 'scene/kp mismatch' }, { status: 400 })
  }
  const practiceSnapshot = {
    task: scene.contentSlots.task?.trim() ?? '',
    feedback: scene.contentSlots.feedback?.trim() ?? '',
  }
  if (!practiceSnapshot.task || !practiceSnapshot.feedback) {
    return NextResponse.json({ error: 'practice content has no stable task/feedback snapshot' }, { status: 409 })
  }
  // 客户端回传实际渲染版本用于防止旧页面错绑；落库始终使用服务端读取的内容。
  if (
    body.practiceSnapshot.task !== practiceSnapshot.task
    || body.practiceSnapshot.feedback !== practiceSnapshot.feedback
  ) {
    return NextResponse.json({ error: 'practice content changed; reload before submitting evidence' }, { status: 409 })
  }
  const objectiveCriteria = practiceObjectiveCriteria(course.goals, body.kpId)
  if (objectiveCriteria.length === 0) {
    return NextResponse.json({ error: 'practice objective has no success criterion' }, { status: 409 })
  }
  const reflectionIssue = practiceReflectionQualityReason(body.outcome, body.reflectionText)
  if (reflectionIssue) {
    return NextResponse.json({ error: reflectionIssue }, { status: 400 })
  }

  const result = await recordPracticeAttempt({
    courseId: body.courseId,
    sessionId: body.sessionId,
    sceneId: body.sceneId,
    kpId: body.kpId,
    practiceSnapshot,
    objectiveCriteria,
    outcome: body.outcome,
    confidence: body.confidence,
    attemptText: body.attemptText,
    reflectionText: body.reflectionText,
  })
  return NextResponse.json({
    ok: true,
    kpId: body.kpId,
    score: result.score,
    weak: isWeakMastery(result.score),
    calibration: result.calibration,
    followUp: result.followUp,
    evidenceBasis: result.evidenceBasis,
    scoreStatus: result.scoreStatus,
  })
}
