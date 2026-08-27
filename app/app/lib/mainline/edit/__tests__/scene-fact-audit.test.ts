import { describe, expect, it } from 'vitest'
import { pickCastPreset } from '../../generation/cast-preset.js'
import { compileLessonFromKps } from '../../generation/compile-lesson.js'
import type { FillLLMCall } from '../../generation/fill-scenes.js'
import type { MainlineCourse } from '../../domain.js'
import { auditSceneFacts } from '../scene-fact-audit.js'

function makeCourse(): MainlineCourse {
  const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'chinese' })
  const course = compileLessonFromKps({
    kps: [{ id: 'kp-1', canonicalName: '消息文体特征' }],
    gradeBand: 'middle-school',
    subject: 'chinese',
    preset,
  })
  for (const scene of course.scenes) {
    if (scene.sceneType === 'visual-observation') {
      scene.contentSlots = {
        panelATitle: '标题', panelA: '用一句话概括消息的核心事件。',
        panelBTitle: '导语', panelB: '集中交代时间、地点、人物等要素。',
        panelCTitle: '主体', panelC: '继续补充事件过程、背景和细节。',
      }
    } else if (scene.sceneType === 'concept-build') {
      scene.contentSlots = { statement: '消息按信息重要程度分层展开', example: '标题概括事件，导语浓缩要素，主体补充细节' }
    } else if (scene.sceneType === 'practice') {
      scene.contentSlots = {
        task: '阅读新例“昨日本市图书馆开馆，首日接待读者三千人”，用自己的话解释消息文体的核心含义，并指出这个新例中的关键特征。',
        feedback: '完成标准：说明消息用简洁文字交代核心事实，并指出时间、地点、事件等要素。关键依据是句中可核对的信息；若只复述原句，请重新圈出要素并用自己的话订正。',
      }
      scene.studentAction = '解释消息文体的核心含义，并在新例中指出关键特征'
    } else if (scene.sceneType === 'recap') {
      scene.contentSlots = {
        shapeSummary: '消息按信息重要程度分层展开',
        shapeItem1: '标题概括核心事件',
        shapeItem2: '导语浓缩新闻要素',
        shapeItem3: '主体补充过程细节',
        takeaway: '判断消息结构要看每层承担的信息功能',
        transferTask: '如果只把短讯第二句换成背景说明，判断它属于导语还是主体并说明依据。',
      }
    }
  }
  return course
}

function pendingCourse(extraPending: string[] = []): { course: MainlineCourse; sceneId: string } {
  const course = makeCourse()
  const sceneId = course.scenes.find(scene => scene.sceneType === 'concept-build')!.id
  const auditedSceneIds = course.scenes.map(scene => scene.id).filter(id => id !== sceneId)
  return {
    sceneId,
    course: {
      ...course,
      qualityStatus: 'blocked',
      factAudit: {
        auditedAt: '2026-08-21T00:00:00.000Z',
        auditedSceneIds,
        pendingSceneIds: [sceneId, ...extraPending],
        auditedSceneCount: auditedSceneIds.length,
        fatalCount: 0,
        issues: [],
      },
    },
  }
}

const cleanAudit: FillLLMCall = async () => ({ claims: [] })

describe('auditSceneFacts', () => {
  it('只核查当前页：保留教师内容、清除 pending 并恢复通过', async () => {
    const { course, sceneId } = pendingCourse()
    const before = course.scenes.find(scene => scene.id === sceneId)!
    const result = await auditSceneFacts(course, sceneId, { llm: cleanAudit })
    if ('error' in result) throw new Error('unexpected error')

    expect(result.course.scenes.find(scene => scene.id === sceneId)).toEqual(before)
    expect(result.course.factAudit?.pendingSceneIds).toEqual([])
    expect(result.course.factAudit?.auditedSceneIds).toContain(sceneId)
    expect(result.course.qualityStatus).toBe('passed')
  })

  it('核查发现 FATAL 时保留阻断', async () => {
    const { course, sceneId } = pendingCourse()
    const result = await auditSceneFacts(course, sceneId, {
      llm: async () => ({
        claims: [{
          claim: '错误断言示例',
          verdict: 'fatal',
          evidence: '与教材事实不符',
          fix: '按教材改正',
        }],
      }),
    })
    if ('error' in result) throw new Error('unexpected error')

    expect(result.course.factAudit?.pendingSceneIds).toEqual([])
    expect(result.course.factAudit?.fatalCount).toBe(1)
    expect(result.course.qualityStatus).toBe('blocked')
  })

  it('其他页面仍待核查时，本页通过也不能放行整课', async () => {
    const otherPending = 'another-scene'
    const { course, sceneId } = pendingCourse([otherPending])
    const result = await auditSceneFacts(course, sceneId, { llm: cleanAudit })
    if ('error' in result) throw new Error('unexpected error')

    expect(result.course.factAudit?.pendingSceneIds).toEqual([otherPending])
    expect(result.course.qualityStatus).toBe('blocked')
  })

  it('核查服务失败时不冒充已核查，继续保留 pending 与课堂阻断', async () => {
    const { course, sceneId } = pendingCourse()
    const originalAuditedAt = course.factAudit?.auditedAt
    const result = await auditSceneFacts(course, sceneId, {
      llm: async () => {
        throw new Error('audit service unavailable')
      },
    })
    if ('error' in result) throw new Error('unexpected error')

    expect(result.course.factAudit?.pendingSceneIds).toEqual([sceneId])
    expect(result.course.factAudit?.auditedSceneIds).not.toContain(sceneId)
    expect(result.course.factAudit?.auditedAt).toBe(originalAuditedAt)
    expect(result.course.factAudit?.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        targetId: sceneId,
        severity: 'info',
        message: expect.stringContaining('事实核查未完成'),
      }),
    ]))
    expect(result.course.qualityStatus).toBe('blocked')
  })

  it('scene 不存在时返回 error', async () => {
    const result = await auditSceneFacts(makeCourse(), 'missing', { llm: cleanAudit })
    expect(result).toEqual({ error: 'scene not found: missing' })
  })
})
