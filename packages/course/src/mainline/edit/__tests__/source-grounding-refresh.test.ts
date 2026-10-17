import { describe, expect, it } from 'vitest'
import type { MainlineCourse, SourceMaterialGrounding } from '../../domain.js'
import { GOLDEN_MAINLINE_COURSES } from '../../samples.js'
import {
  refreshCourseSourceGroundings,
  sourceMaterialNeedsGroundingRefresh,
} from '../source-grounding-refresh.js'

function legacySourceCourse(excerpt = '待 LLM 填充教材原文或定义引用。'): MainlineCourse {
  const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
  const source = course.sourceMaterial[0]!
  course.sourceMaterial[0] = {
    kind: source.kind,
    title: source.title,
    kpId: source.kpId ?? 'kp-source-refresh',
    excerpt,
  }
  return { ...course, qualityStatus: 'passed' }
}

function locator(): SourceMaterialGrounding {
  return {
    citation: '课程目录来源 pep-cn，节点 leaf-1（仅用于教材定位）',
    provenance: {
      source: 'pep-cn',
      externalId: 'leaf-1',
      evidenceStatus: 'curriculum-metadata',
    },
  }
}

describe('refreshCourseSourceGroundings · 存量课程教材依据刷新', () => {
  it('移除伪摘录并回填教材节点，撤销基于旧证据的审查和签名', () => {
    const course = {
      ...legacySourceCourse(),
      generationSession: {
        schemaVersion: 'mainline-generation-session-v1', id: 'session-1', courseId: 'course-1', planRevisionId: 'plan-1',
        status: 'course-audit', createdAt: '2026-09-22T00:00:00.000Z', updatedAt: '2026-09-22T00:01:00.000Z',
        jobs: [],
      },
      factAudit: { id: 'fact-1' },
      generationCourseAudit: { id: 'course-audit-1' },
      teachingQualityAudit: { id: 'teaching-audit-1', status: 'passed' },
      teacherAcceptance: { finalSignature: 'signed' },
    } as unknown as MainlineCourse
    const source = course.sourceMaterial[0]!
    const oldSessionToken = course.generationSession!.updatedAt
    const teachingContent = {
      scenes: course.scenes,
      learningFragments: course.learningFragments,
      beats: course.beats,
      castProfiles: course.castProfiles,
      voiceProfiles: course.voiceProfiles,
    }

    const result = refreshCourseSourceGroundings(course, { [source.kpId!]: locator() })
    const refreshed = result.course.sourceMaterial[0]!

    expect(refreshed.excerpt).toBeUndefined()
    expect(refreshed.citation).toContain('leaf-1')
    expect(refreshed.provenance).toEqual(locator().provenance)
    expect(result.refreshedKpIds).toEqual([source.kpId])
    expect(result.clearedPlaceholderKpIds).toEqual([source.kpId])
    expect(result.course.qualityStatus).toBe('draft')
    expect(result.course.factAudit).toBeUndefined()
    expect(result.course.generationCourseAudit).toBeUndefined()
    expect(result.course.teachingQualityAudit).toBeUndefined()
    expect(result.course.teacherAcceptance).toBeUndefined()
    expect(result.course.generationSession?.updatedAt).not.toBe(oldSessionToken)
    expect(result.course.generationSession?.status).toBe('generating')
    expect({
      scenes: result.course.scenes,
      learningFragments: result.course.learningFragments,
      beats: result.course.beats,
      castProfiles: result.course.castProfiles,
      voiceProfiles: result.course.voiceProfiles,
    }).toEqual(teachingContent)
  })

  it('保留已有的非占位摘录，只补足可核查定位', () => {
    const course = legacySourceCourse('教师已经核对过的原文摘录。')
    const source = course.sourceMaterial[0]!

    expect(sourceMaterialNeedsGroundingRefresh(source)).toBe(true)
    const result = refreshCourseSourceGroundings(course, { [source.kpId!]: locator() })

    expect(result.course.sourceMaterial[0]?.excerpt).toBe('教师已经核对过的原文摘录。')
    expect(result.course.sourceMaterial[0]?.citation).toContain('leaf-1')
    expect(result.clearedPlaceholderKpIds).toEqual([])
  })

  it('来源变更撤销旧事实阻断并要求重新审查', () => {
    const course = legacySourceCourse()
    const source = course.sourceMaterial[0]!
    course.factAudit = {
      auditedAt: '2026-08-22T00:00:00.000Z',
      auditedSceneCount: 1,
      fatalCount: 1,
      issues: [{
        id: 'fact-block',
        severity: 'blocking',
        targetId: course.scenes[0]!.id,
        message: '事实错误',
        impact: '会误导学生',
        fix: '按教材修正',
      }],
    }

    const result = refreshCourseSourceGroundings(course, { [source.kpId!]: locator() })

    expect(result.course.qualityStatus).toBe('draft')
    expect(result.course.factAudit).toBeUndefined()
  })

  it('索引没有当前知识点定位时保持原课程不变', () => {
    const base = legacySourceCourse()
    const course = {
      ...base,
      generationSession: {
      schemaVersion: 'mainline-generation-session-v1', id: 'session-1', courseId: base.id, planRevisionId: 'plan-1',
      status: 'course-audit', createdAt: '2026-09-22T00:00:00.000Z', updatedAt: '2026-09-22T00:01:00.000Z', jobs: [],
      },
      teachingQualityAudit: { id: 'teaching-audit-1', status: 'passed' },
    } as unknown as MainlineCourse
    const sessionToken = course.generationSession!.updatedAt
    const result = refreshCourseSourceGroundings(course, {})

    expect(result.refreshedKpIds).toEqual([])
    expect(result.course.sourceMaterial).toEqual(course.sourceMaterial)
    expect(result.course.teachingQualityAudit).toEqual(course.teachingQualityAudit)
    expect(result.course.generationSession?.updatedAt).toBe(sessionToken)
  })

  it('只有候选资源、没有教材节点时不冒充依据刷新成功', () => {
    const course = legacySourceCourse()
    const source = course.sourceMaterial[0]!
    const result = refreshCourseSourceGroundings(course, {
      [source.kpId!]: {
        candidateResources: [{
          id: 'resource-1',
          kind: 'textbook-asset',
          title: '候选图片',
          assetUrl: '/resource-1.png',
          mediaType: 'image/png',
        }],
      },
    })

    expect(result.refreshedKpIds).toEqual([])
    expect(result.course.sourceMaterial).toEqual(course.sourceMaterial)
  })
})
