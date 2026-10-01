import { describe, expect, it } from 'vitest'
import type { MainlineCourse, QualityIssue } from '../index.js'
import { generationInputHash } from '../generation-session.js'
import { courseReleaseReadinessFromIssues, courseReleaseReason } from '../readiness.js'
import { teachingQualityInputHash, teachingQualityStandards } from '../teaching-quality-audit.js'

function course(
  qualityStatus: MainlineCourse['qualityStatus'],
  factAudit?: MainlineCourse['factAudit'],
): MainlineCourse {
  return { id: 'course-1', qualityStatus, ...(factAudit ? { factAudit } : {}) } as MainlineCourse
}

function blocker(id = 'issue-1'): QualityIssue {
  return {
    id,
    gate: 'pedagogy',
    severity: 'blocking',
    targetType: 'scene',
    targetId: 'scene-1',
    message: '当前规则发现阻断问题。',
    impact: '不能发布。',
    fix: '修正内容。',
    autoFixable: true,
  }
}

function pageFirstCourse(status: 'review' | 'ready'): MainlineCourse {
  const course = {
    id: 'page-course-1',
    qualityStatus: status === 'ready' ? 'passed' : 'draft',
    sourceMaterial: [],
    planning: {
      schemaVersion: 'mainline-page-v2',
      courseId: 'page-course-1',
      planRevisionId: 'page-course-1:plan:1',
      status,
      learningContracts: [],
      arc: { id: 'page-course-1:plan:1:arc', courseId: 'page-course-1', steps: [] },
      pages: [{
        id: 'lp-001-orient', order: 1, fragmentId: 'opening', knowledgePointIds: [],
        purpose: 'orient', audience: 'student', learningAction: '先形成判断。',
        newInformation: '呈现学习问题。', sourceRefs: [],
        contentSpec: { kind: 'course-orientation', topic: '测试课程', goalIds: [] },
        visualSpec: { required: false, form: 'none', reason: '开场不使用配图。', sourceAssetPolicy: 'none' },
        teacherCompanion: { scriptGoal: '说明问题。', teachingMove: '收集判断。', pace: 'brief' },
        arcStepId: 'arc-001-orient',
      }],
    },
    pageContent: {
      schemaVersion: 'mainline-page-content-v1',
      courseId: 'page-course-1',
      planRevisionId: 'page-course-1:plan:1',
      contentRevisionId: 'content-1',
      status: 'review',
      pages: [{
        pageId: 'lp-001-orient', order: 1, purpose: 'orient', planRevisionId: 'page-course-1:plan:1', sourceRefs: [],
        content: { kind: 'course-orientation', title: '测试课程', learningQuestion: '这节课需要解决什么问题？', goals: ['能够根据材料说明自己的判断依据。'] },
        teacherCompanion: { script: '先看本课要解决的问题，请独立形成判断，再说出你使用的依据。', notes: [], pace: 'brief' },
      }],
    },
    factAudit: {
      contentRevisionId: 'content-1',
      auditedAt: '2026-08-30T00:00:00.000Z',
      auditedSceneCount: 1,
      auditedSceneIds: ['lp-001-orient'],
      requiredSceneIds: ['lp-001-orient'],
      unverifiedSceneIds: [],
      fatalCount: 0,
      issues: [],
    },
  } as unknown as MainlineCourse
  course.generationSession = {
    schemaVersion: 'mainline-generation-session-v1', id: 'session-1', courseId: course.id,
    planRevisionId: course.planning!.planRevisionId, status: status === 'ready' ? 'ready' : 'course-audit',
    jobs: [{
      pageId: 'lp-001-orient', order: 1, planRevisionId: course.planning!.planRevisionId, attempt: 1, status: 'passed',
      inputHash: 'a'.repeat(64), diagnostics: [], updatedAt: '2026-08-30T00:00:00.000Z',
      checkpoint: {
        pageId: 'lp-001-orient', planRevisionId: course.planning!.planRevisionId, inputHash: 'a'.repeat(64),
        contentRevisionId: 'page-content-1', factAuditRevisionId: 'page-fact-1', renderEvidenceId: 'render-1', createdAt: '2026-08-30T00:00:00.000Z',
      },
    }], createdAt: '2026-08-30T00:00:00.000Z', updatedAt: '2026-08-30T00:00:00.000Z',
  }
  course.pageRenderEvidence = [{
    schemaVersion: 'mainline-page-render-v1', id: 'render-1', courseId: course.id, pageId: 'lp-001-orient',
    planRevisionId: course.planning!.planRevisionId, contentRevisionId: 'page-content-1', screenshotPath: 'render-1.png', screenshotSha256: 'b'.repeat(64),
    viewport: { width: 1920, height: 1080 }, metrics: { minimumFontPx: 28, clippedElementCount: 0, overlappingTextCount: 0, brokenImageCount: 0, visualElementCount: 0, occupiedAreaRatio: 0.3 }, issues: [], createdAt: '2026-08-30T00:00:00.000Z',
  }]
  if (status === 'ready') {
    course.generationCourseAudit = {
      schemaVersion: 'mainline-course-audit-v1', id: 'audit-1', courseId: course.id, planRevisionId: course.planning!.planRevisionId,
      contentRevisionId: course.pageContent!.contentRevisionId, renderEvidenceIds: ['render-1'], pageIds: ['lp-001-orient'],
      factAuditAt: '2026-08-30T00:00:00.000Z', passedAt: '2026-08-30T00:00:00.000Z',
    }
    course.teachingQualityAudit = {
      schemaVersion: 'mainline-teaching-quality-audit-v1', id: 'teaching-1', courseId: course.id,
      planRevisionId: course.planning!.planRevisionId, contentRevisionId: course.pageContent!.contentRevisionId,
      generationCourseAuditId: 'audit-1', status: 'passed', standards: [], findings: [], auditedAt: '2026-08-30T00:00:00.000Z',
    }
    course.teachingQualityAudit.standards = teachingQualityStandards(course)
    course.teachingQualityAudit.inputHash = teachingQualityInputHash(course)
    course.teacherAcceptance = {
      schemaVersion: 'mainline-teacher-acceptance-v1', courseId: course.id, planRevisionId: course.planning!.planRevisionId,
      courseAuditId: 'audit-1', pages: [{ pageId: 'lp-001-orient', contentRevisionId: 'page-content-1', renderEvidenceId: 'render-1', acceptedAt: '2026-08-30T00:00:00.000Z' }],
      finalSignature: generationInputHash({
        courseId: course.id,
        planRevisionId: course.planning!.planRevisionId,
        courseAuditId: 'audit-1',
        pages: [{ pageId: 'lp-001-orient', contentRevisionId: 'page-content-1', renderEvidenceId: 'render-1' }],
      }),
      acceptedAt: '2026-08-30T00:00:00.000Z',
    }
  }
  return course
}

function resignTeachingAudit(course: MainlineCourse): void {
  const audit = course.teachingQualityAudit
  if (audit) audit.inputHash = teachingQualityInputHash(course)
}

describe('course release readiness', () => {
  it('keeps a clean persisted pass ready', () => {
    const result = courseReleaseReadinessFromIssues(course('passed'), [])

    expect(result).toMatchObject({ status: 'passed', ready: true, stalePassed: false, blockingCount: 0 })
    expect(courseReleaseReason(result)).toBeUndefined()
  })

  it('downgrades a stale persisted pass when a current deterministic gate blocks', () => {
    const result = courseReleaseReadinessFromIssues(course('passed'), [blocker()])

    expect(result).toMatchObject({ storedStatus: 'passed', status: 'blocked', ready: false, stalePassed: true, blockingCount: 1 })
    expect(result.blockers[0]).toMatchObject({ source: 'quality-gate', targetId: 'scene-1' })
    expect(courseReleaseReason(result)).toContain('上次记录为已通过')
  })

  it('blocks a persisted pass for fact issues and pending teacher edits', () => {
    const result = courseReleaseReadinessFromIssues(course('passed', {
      auditedSceneCount: 1,
      fatalCount: 1,
      pendingSceneIds: ['scene-2', 'scene-2'],
      issues: [{
        id: 'fact-1', severity: 'blocking', targetId: 'scene-1',
        message: '事实错误。', impact: '误导学生。', fix: '核对教材。',
      }],
    }), [])

    expect(result.blockingCount).toBe(2)
    expect(result.blockers.map(item => item.source)).toEqual(['fact-audit', 'fact-audit-pending'])
  })

  it('honors legacy fatalCount even when old issue details are absent', () => {
    const result = courseReleaseReadinessFromIssues(course('passed', {
      auditedSceneCount: 1,
      fatalCount: 2,
      issues: [],
    }), [])

    expect(result).toMatchObject({ status: 'blocked', blockingCount: 2 })
    expect(result.blockers[0]?.message).toContain('2 个未展开')
  })

  it('按当前发布语义阻断存量 warning 形式的 MISLEADING，不要求先批量改库', () => {
    const result = courseReleaseReadinessFromIssues(course('passed', {
      auditedSceneCount: 1,
      fatalCount: 0,
      issues: [{
        id: 'legacy-misleading', severity: 'warning', targetId: 'scene-1',
        message: '断言核查 MISLEADING:「只看端点数量」',
        impact: '会把折线误判成线段。', fix: '补齐三个判据。',
      }],
    }), [])

    expect(result).toMatchObject({ status: 'blocked', stalePassed: true, blockingCount: 1 })
    expect(result.blockers[0]).toMatchObject({ source: 'fact-audit', targetId: 'scene-1' })
  })

  it('核查服务失败的页面阻断发布，并与同页 pending 合并为一个阻断', () => {
    const result = courseReleaseReadinessFromIssues(course('passed', {
      auditedSceneCount: 0,
      requiredSceneIds: ['scene-2'],
      unverifiedSceneIds: ['scene-2'],
      pendingSceneIds: ['scene-2'],
      fatalCount: 0,
      issues: [{
        id: 'unverified', severity: 'info', targetId: 'scene-2',
        message: '事实核查未完成(核查服务失败),本幕断言未经验证。',
        impact: '错误断言可能未被发现。', fix: '重新核查。',
      }],
    }), [])

    expect(result).toMatchObject({ status: 'blocked', stalePassed: true, blockingCount: 1 })
    expect(result.blockers.map(item => item.source)).toEqual(['fact-audit-unverified'])
  })

  it('never upgrades persisted blocked or draft state while reading', () => {
    const blocked = courseReleaseReadinessFromIssues(course('blocked'), [])
    const draft = courseReleaseReadinessFromIssues(course('draft'), [])

    expect(blocked).toMatchObject({ status: 'blocked', ready: false, blockingCount: 1 })
    expect(blocked.blockers[0]?.source).toBe('persisted-status')
    expect(draft).toMatchObject({ status: 'draft', ready: false, blockingCount: 0 })
  })

  it('uses the page workflow instead of legacy scene gates for page-first courses', () => {
    const review = courseReleaseReadinessFromIssues(pageFirstCourse('review'), [blocker()])
    const ready = courseReleaseReadinessFromIssues(pageFirstCourse('ready'), [blocker()])

    expect(review).toMatchObject({ status: 'draft', ready: false, workflowStatus: 'review', blockingCount: 0 })
    expect(courseReleaseReason(review)).toContain('备课检查')
    expect(ready).toMatchObject({ status: 'passed', ready: true, workflowStatus: 'ready', blockingCount: 0 })
    expect(ready.deterministicIssues).toEqual([])
  })

  it('blocks a page-first classroom version when content belongs to another plan', () => {
    const stale = pageFirstCourse('ready')
    stale.pageContent = { ...stale.pageContent!, planRevisionId: 'old-plan' }
    const result = courseReleaseReadinessFromIssues(stale, [])

    expect(result).toMatchObject({ status: 'blocked', ready: false, stalePassed: true })
    expect(result.blockers.some(item => item.source === 'page-content')).toBe(true)
  })

  it('blocks a page-first classroom version without a matching whole-course fact audit', () => {
    const stale = pageFirstCourse('ready')
    delete stale.factAudit
    const missing = courseReleaseReadinessFromIssues(stale, [])
    expect(missing.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'fact-audit-unverified' }),
    ]))

    stale.factAudit = {
      contentRevisionId: 'old-content', auditedSceneCount: 1, fatalCount: 0, issues: [],
    }
    const mismatched = courseReleaseReadinessFromIssues(stale, [])
    expect(mismatched.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'fact-audit-unverified' }),
    ]))
  })

  it('blocks a classroom version without a current passed AI teaching-quality audit', () => {
    const stale = pageFirstCourse('ready')
    delete stale.teachingQualityAudit

    const result = courseReleaseReadinessFromIssues(stale, [])

    expect(result).toMatchObject({ status: 'blocked', ready: false })
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'teacher-acceptance', message: expect.stringContaining('AI 教学审查') }),
    ]))
  })

  it('fails closed when teaching inputs change without revision IDs changing', () => {
    const changedSource = pageFirstCourse('ready')
    changedSource.sourceMaterial.push({ kind: 'textbook', title: '新增教材证据', excerpt: '新的证据。' })
    const sourceResult = courseReleaseReadinessFromIssues(changedSource, [])

    const changedPage = pageFirstCourse('ready')
    changedPage.pageContent!.pages[0]!.content = {
      kind: 'course-orientation', title: '测试课程', goals: ['能够根据材料说明自己的判断依据。'],
      learningQuestion: '修改后的学生问题是什么？',
    }
    const pageResult = courseReleaseReadinessFromIssues(changedPage, [])

    expect(sourceResult).toMatchObject({ ready: false, status: 'blocked' })
    expect(pageResult).toMatchObject({ ready: false, status: 'blocked' })
    expect(sourceResult.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'teacher-acceptance', message: expect.stringContaining('AI 教学审查') }),
    ]))
  })

  it('fails closed for a legacy passed teaching audit without an input signature', () => {
    const legacy = pageFirstCourse('ready')
    delete legacy.teachingQualityAudit!.inputHash

    expect(courseReleaseReadinessFromIssues(legacy, [])).toMatchObject({ ready: false, status: 'blocked' })
  })

  it('fails closed when accepted pages or the final signature do not match current render checkpoints', () => {
    const stalePage = pageFirstCourse('ready')
    stalePage.teacherAcceptance!.pages[0]!.renderEvidenceId = 'old-render'
    expect(courseReleaseReadinessFromIssues(stalePage, [])).toMatchObject({ ready: false, status: 'blocked' })

    const staleSignature = pageFirstCourse('ready')
    staleSignature.teacherAcceptance!.finalSignature = 'c'.repeat(64)
    expect(courseReleaseReadinessFromIssues(staleSignature, [])).toMatchObject({ ready: false, status: 'blocked' })
  })

  it('blocks visible figure references when the actual page has no image', () => {
    const visualCourse = pageFirstCourse('ready')
    const page = visualCourse.pageContent!.pages[0]!
    page.content = {
      kind: 'observation',
      title: '观察下图',
      prompt: '根据下图判断两个量的关系。',
      evidenceLabels: ['图中数据', '变化方向'],
    }

    const result = courseReleaseReadinessFromIssues(visualCourse, [])

    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'page-visual', targetId: 'lp-001-orient' }),
    ]))
  })

  it('accepts a generated page image for a required page-first teaching visual', () => {
    const visualCourse = pageFirstCourse('ready')
    visualCourse.planning!.pages[0]!.visualSpec = {
      required: true,
      form: 'instructional-image',
      reason: '学生需要观察可核验对象。',
      sourceAssetPolicy: 'grounded-or-generate',
    }

    const blocked = courseReleaseReadinessFromIssues(visualCourse, [])
    expect(blocked.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'page-visual', targetId: 'lp-001-orient' }),
    ]))

    visualCourse.pageContent!.pages[0]!.imageUrl = '/generated-images/observation.png'
    resignTeachingAudit(visualCourse)
    const ready = courseReleaseReadinessFromIssues(visualCourse, [])
    expect(ready).toMatchObject({ status: 'passed', ready: true, blockingCount: 0 })
  })

  it('accepts a complete text or data material when the task does not refer to a figure', () => {
    const materialCourse = pageFirstCourse('ready')
    materialCourse.planning!.pages[0] = {
      ...materialCourse.planning!.pages[0]!,
      purpose: 'observe',
      contentSpec: { kind: 'observation', focus: '核对反应前后总质量', requiredEvidence: '列出反应前后数据。' },
      visualSpec: {
        required: true,
        form: 'instructional-image',
        reason: '旧规划把所有非语言观察页都标成配图。',
        sourceAssetPolicy: 'grounded-or-generate',
      },
    }
    materialCourse.pageContent!.pages[0] = {
      ...materialCourse.pageContent!.pages[0]!,
      purpose: 'observe',
      content: {
        kind: 'observation',
        title: '核对称量记录',
        prompt: '比较反应前后总质量。',
        materialCaption: '反应前总质量 125.6 g；反应后总质量 125.6 g。',
        evidenceLabels: ['反应前总质量', '反应后总质量'],
      },
    }
    resignTeachingAudit(materialCourse)

    const result = courseReleaseReadinessFromIssues(materialCourse, [])

    expect(result).toMatchObject({ status: 'passed', ready: true, blockingCount: 0 })
  })
})
