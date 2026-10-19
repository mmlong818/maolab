// Task 12 fix round 1：面板视图按真实枚举判定（C1、M3–M6）、改为讲解页的两步操作（M2）、对话的过期守卫（I1）、换课（M1）、过期刷新（M7）、建课防双击（M8）。
// web 测试环境是 node：组件用 renderToStaticMarkup 静态渲染，交互逻辑抽成纯函数测；时序相关的接线用源码断言。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { PrepApiError } from '../lib/api'
import type { PrepWorkbench } from '../lib/panel-model'
import PlanView from '../panel/PlanView'
import AcceptanceView from '../panel/AcceptanceView'
import QualityView from '../panel/QualityView'
import {
  acceptErrorText, canAcceptCourse, courseStatusText, downloadState, PAGE_PURPOSE_LABEL, PLAN_STATUS_LABEL, planEditable,
  QUALITY_STATUS_LABEL, renderNoteText, replaceWithExplanation, teacherAuditAdvice, viewFor,
} from '../panel/view-model'
import { createLatest } from '../chat/latest'

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')
const TOOL_NAMES = /audit_course|repair_page|render_page|accept_page|export_pptx|read_course|audit_page|approve_plan/

const page = (id: string, order: number, image = false) => ({
  id, order, purpose: order === 1 ? 'orient' : 'explain', learningAction: `动作${order}`, newInformation: `信息${order}`,
  visualSpec: image ? { required: true, form: 'instructional-image' } : { required: false, form: 'none' },
})
function workbench(over: { planStatus?: string; sessionStatus?: string | null; pending?: string[]; auditBlocked?: unknown; finalSignature?: string | null } = {}): PrepWorkbench {
  const sessionStatus = over.sessionStatus ?? null
  return {
    course: {
      planning: { status: over.planStatus ?? 'planning', pages: [page('p1', 1), page('p2', 2, true)] },
      ...(sessionStatus ? { generationSession: { status: sessionStatus, jobs: [] } } : {}),
      sourceMaterial: [{ kpId: 'a' }, { kpId: 'b' }],
    },
    summary: {
      sessionStatus,
      pages: [
        { pageId: 'p1', order: 1, purpose: 'orient', needsImage: false, status: 'passed', lastDiagnostic: null, render: null, accepted: false },
        { pageId: 'p2', order: 2, purpose: 'explain', needsImage: true, status: 'passed', lastDiagnostic: null, render: null, accepted: false },
      ],
      acceptance: over.finalSignature ? { acceptedPages: ['p1', 'p2'], finalSignature: over.finalSignature } : null,
    },
    teachingAudit: null,
    unacceptedPageIds: over.pending ?? [],
    auditBlocked: over.auditBlocked ?? null,
    exportReady: { ok: false, message: '还不能导出', blockers: null },
  }
}
const noop = () => undefined

describe('计划视图按真实计划状态（C1）', () => {
  const render = (planStatus: string) => renderToStaticMarkup(createElement(PlanView, { courseId: 'c1', workbench: workbench({ planStatus }), imagesAvailable: false, onChanged: noop }))

  it('planning 的课程显示 保存修改、确认计划、改为讲解页', () => {
    const html = render('planning')
    expect(html).toContain('保存修改')
    expect(html).toContain('确认计划')
    expect(html).toContain('改为讲解页')
  })

  it.each(['plan-approved', 'generating', 'review', 'ready', 'archived'])('%s 的课程不显示任何计划写操作', (status) => {
    const html = render(status)
    expect(html).not.toContain('保存修改')
    expect(html).not.toContain('确认计划')
    expect(html).not.toContain('改为讲解页')
  })

  it('只有 planning 可编辑；源码里不再拿不存在的 draft 计划状态做比较', () => {
    expect(planEditable('planning')).toBe(true)
    for (const s of ['draft', 'review', 'plan-approved', 'generating', 'ready', 'archived', undefined]) expect(planEditable(s)).toBe(false)
    for (const p of ['app/prep/panel/PlanView.tsx', 'app/prep/panel/CourseList.tsx', 'app/prep/panel/QualityView.tsx', 'app/prep/panel/AcceptanceView.tsx']) {
      expect([p, /status === 'draft'|status === 'review'|draft: '计划中'/.test(read(p))]).toEqual([p, false])
    }
  })
})

describe('中文标签对照真实枚举（M3/M4）', () => {
  it('计划状态、质量状态、页用途都有中文；质量 draft 不叫"计划中"', () => {
    for (const s of ['planning', 'plan-approved', 'generating', 'review', 'ready', 'archived']) expect(PLAN_STATUS_LABEL[s as keyof typeof PLAN_STATUS_LABEL]).toMatch(/[一-龥]/)
    for (const s of ['draft', 'blocked', 'passed']) expect(QUALITY_STATUS_LABEL[s as keyof typeof QUALITY_STATUS_LABEL]).toMatch(/[一-龥]/)
    expect(QUALITY_STATUS_LABEL.draft).not.toContain('计划')
    for (const p of ['orient', 'structure', 'source', 'observe', 'explain', 'question', 'answer', 'worked-step', 'practice', 'feedback', 'recap', 'transfer']) {
      expect(PAGE_PURPOSE_LABEL[p as keyof typeof PAGE_PURPOSE_LABEL]).toMatch(/^[一-龥]+$/)
    }
    expect(courseStatusText({ planStatus: 'plan-approved', qualityStatus: 'draft', sessionStatus: 'rendering' })).not.toMatch(/[a-z]/)
  })

  it('计划、质量、验收视图里不出现英文的页用途', () => {
    const plan = renderToStaticMarkup(createElement(PlanView, { courseId: 'c1', workbench: workbench(), imagesAvailable: true, onChanged: noop }))
    const quality = renderToStaticMarkup(createElement(QualityView, { courseId: 'c1', workbench: workbench({ sessionStatus: 'rendering' }), onChanged: noop }))
    const accept = renderToStaticMarkup(createElement(AcceptanceView, { courseId: 'c1', workbench: workbench({ sessionStatus: 'awaiting-teacher-acceptance', pending: ['p1'] }), onChanged: noop }))
    for (const html of [plan, quality, accept]) {
      expect(html).not.toMatch(/>orient<|>explain<|orient<\/|· orient|· explain/)
      expect(html).toContain('导入')
    }
  })
})

describe('整课验收只在待验收时可点，422 转成老师能看懂的话（M5）', () => {
  const render = (w: PrepWorkbench) => renderToStaticMarkup(createElement(AcceptanceView, { courseId: 'c1', workbench: w, onChanged: noop }))

  it('有生成会话但还没到待验收：不显示整课验收按钮，只说下一步', () => {
    const html = render(workbench({ sessionStatus: 'course-audit', planStatus: 'generating' }))
    expect(html).not.toContain('整课验收</button>')
    expect(html).not.toMatch(TOOL_NAMES)
    expect(canAcceptCourse(workbench({ sessionStatus: 'course-audit' }))).toBe(false)
  })

  it('待验收且逐页都验完：整课验收可点；还有未验收页时不可点', () => {
    expect(canAcceptCourse(workbench({ sessionStatus: 'awaiting-teacher-acceptance' }))).toBe(true)
    expect(render(workbench({ sessionStatus: 'awaiting-teacher-acceptance' }))).toMatch(/<button( class="[^"]*")? type="button">整课验收<\/button>/)
    expect(render(workbench({ sessionStatus: 'awaiting-teacher-acceptance', pending: ['p1'] }))).toMatch(/<button( class="[^"]*")? type="button" disabled="">整课验收<\/button>/)
    expect(canAcceptCourse(workbench({ sessionStatus: 'ready', finalSignature: 'sig' }))).toBe(false)
  })

  it('422 的模型向文案换成老师能看懂的话', () => {
    const notReady = new PrepApiError(422, { error: '截图都已通过：下一步用 audit_course 做整课审查。', reason: 'session-not-ready' })
    const text = acceptErrorText(notReady, 'course-audit')
    expect(text).not.toMatch(TOOL_NAMES)
    expect(text).toContain('整课审查')
    const pages = new PrepApiError(422, { error: '还有 2 页没有按当前版本逐页验收，整课验收要求每一页都已验收。', reason: 'pages-not-accepted' })
    expect(acceptErrorText(pages, 'awaiting-teacher-acceptance')).toContain('逐页验收')
    expect(acceptErrorText(new PrepApiError(422, { error: '计划还没确认，也没有生成任何页面。', reason: 'session-not-ready' }), null)).toContain('计划')
    expect(renderNoteText('没有需要截图的页。截图都已通过：下一步用 audit_course 做整课审查。', 'course-audit')).not.toMatch(TOOL_NAMES)
  })
})

describe('整课审查被拦：老师能看懂的建议，只有未核实页时也显示（M6、advice）', () => {
  const details = (over: Record<string, unknown>) => ({ findings: [], factIssues: [], unverifiedPageIds: [], pendingPageIds: [], advice: '…直接重跑 audit_course。', ...over })

  it('只有未核实页 / 只有待核查页时也显示，且不出现工具名', () => {
    for (const d of [details({ unverifiedPageIds: ['p1'] }), details({ pendingPageIds: ['p2'] }), details({ unverifiedPageIds: ['p1'], auditError: 'schema 校验失败' })]) {
      const advice = teacherAuditAdvice(d, (id) => id)
      expect(advice.show).toBe(true)
      expect(advice.lines.join('')).not.toMatch(TOOL_NAMES)
      const html = renderToStaticMarkup(createElement(QualityView, { courseId: 'c1', workbench: workbench({ sessionStatus: 'course-audit', auditBlocked: d }), onChanged: noop }))
      expect(html).toMatch(/事实核查没有完成|等待重新核查/)
      expect(html).not.toMatch(TOOL_NAMES)
    }
  })

  it('各列表都空时什么也不多显示（Note for T12）', () => {
    expect(teacherAuditAdvice(details({}), (id) => id).show).toBe(false)
    const html = renderToStaticMarkup(createElement(QualityView, { courseId: 'c1', workbench: workbench({ sessionStatus: 'course-audit', auditBlocked: details({}) }), onChanged: noop }))
    expect(html).not.toContain('事实核查')
  })

  it('逐条问题按 action 给老师的处理办法，页 id 换成第几页', () => {
    const advice = teacherAuditAdvice(details({
      factIssues: [{ pageId: 'p2', impact: '数据有误', fix: '改成 3', action: 'repair-page' }],
      findings: [{ pageId: null, message: '缺课标原文', action: 'add-source' }],
    }), (id) => (id === 'p2' ? '第 2 页' : id))
    expect(advice.show).toBe(true)
    expect(advice.items.some((i) => i.text.startsWith('第 2 页：数据有误'))).toBe(true)
    expect(advice.lines.join('')).not.toMatch(TOOL_NAMES)
    expect(advice.lines.join('')).toContain('来源')
  })
})

describe('改为讲解页：两步操作的失败与防重复（M2）', () => {
  const p = { id: 'p2', purpose: 'explain', learningAction: '看图', newInformation: '图里的关系' }

  it('删除失败：明确说已插入讲解页、原页还在，下一次只删不再插', async () => {
    const updatePlan = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new PrepApiError(409, { error: '备课助理正在处理上一条消息，完成后再改课程。', code: 'PREP_TURN_RUNNING' }))
    const first = await replaceWithExplanation(updatePlan, 'c1', p, false)
    expect(first).toMatchObject({ inserted: true, done: false })
    expect(first.message).toContain('已插入讲解页')
    expect(first.message).toContain('原图像页还在')
    expect(updatePlan).toHaveBeenCalledTimes(2)
    updatePlan.mockResolvedValueOnce({})
    const second = await replaceWithExplanation(updatePlan, 'c1', p, true)
    expect(second).toMatchObject({ inserted: true, done: true })
    expect(updatePlan).toHaveBeenCalledTimes(3)
    expect(updatePlan.mock.calls[2]![1]).toEqual({ action: 'structure', operation: { type: 'delete', pageId: 'p2' } })
  })

  it('插入失败：什么都没改，可以重试', async () => {
    const updatePlan = vi.fn().mockRejectedValueOnce(new PrepApiError(409, { error: '冲突', code: 'PLAN_CONFLICT' }))
    const r = await replaceWithExplanation(updatePlan, 'c1', p, false)
    expect(r).toMatchObject({ inserted: false, done: false })
    expect(updatePlan).toHaveBeenCalledTimes(1)
  })

  it('PlanView 不在结构操作后清掉其他页的未保存修改，并用 ref 防双击', () => {
    const src = read('app/prep/panel/PlanView.tsx')
    expect(src).toContain('replaceWithExplanation(')
    expect(src).toContain('busyRef.current')
    expect(src).not.toMatch(/toExplanation[\s\S]*setEdits\(\{\}\)[\s\S]*return \(/)
  })
})

describe('对话：过期响应与跨会话的帧（I1）', () => {
  it('createLatest：后发的请求让先发的失效，invalidate 让所有在途请求失效', () => {
    const latest = createLatest()
    const a = latest.begin('A')
    const b = latest.begin('B')
    expect(latest.isCurrent(a)).toBe(false)
    expect(latest.isCurrent(b)).toBe(true)
    latest.invalidate()
    expect(latest.isCurrent(b)).toBe(false)
    const c = latest.begin('C')
    expect(latest.isCurrent(c)).toBe(true)
    expect(c.key).toBe('C')
  })

  it('PrepChat：加载与重试都经过期守卫，重试走 pollTimer，流式回复时禁用会话选择，帧只落到发起时的会话', () => {
    const src = read('app/prep/chat/PrepChat.tsx')
    expect(src).toContain('latest.current.begin(')
    expect(src).toContain('latest.current.isCurrent(')
    expect(src).not.toMatch(/(?<!pollTimer\.current = )setTimeout\(\(\) => \{ void load/)
    expect(src).toMatch(/<select aria-label="选择备课对话" disabled=\{inFlight > 0\}/)
    // 终审修复：发送流程移到 controller.ts，帧的会话守卫随之移过去
    expect(read('app/prep/chat/controller.ts')).toContain('if (deps.viewing.current !== started.id) return')
  })
})

describe('换课、过期、建课（M1、M7、M8）', () => {
  it('面板数据带 courseId，换课当次渲染不用旧课程的数据', () => {
    const data = { courseId: 'A', workbench: workbench(), jobs: [] }
    expect(viewFor(data, 'A')).toBe(data)
    expect(viewFor(data, 'B')).toBeNull()
    expect(viewFor(null, 'A')).toBeNull()
    expect(read('app/prep/panel/PrepPanel.tsx')).toContain('viewFor(data, courseId)')
  })

  it('下载链接过期按时钟判断，ExportView 定时刷新', () => {
    const latest = { href: '/api/prep/artifacts/x', filename: 'a.pptx', expiresAt: 1000 }
    expect(downloadState(latest, 999)).toBe('available')
    expect(downloadState(latest, 1000)).toBe('expired')
    expect(downloadState({ ...latest, expiresAt: null }, 10 ** 13)).toBe('available')
    const src = read('app/prep/panel/ExportView.tsx')
    expect(src).toContain('setInterval(')
    expect(src).toContain('downloadState(latest, now)')
  })

  it('建课有同步防双击', () => {
    const src = read('app/prep/panel/CourseList.tsx')
    expect(src).toContain('creatingRef.current')
    expect(src).toContain('<KpPicker busy={busy}')
    expect(read('app/prep/panel/KpPicker.tsx')).toContain('disabled={busy || selected.length === 0}')
  })
})
