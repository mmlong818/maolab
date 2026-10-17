// 3d 终审修复：对话的在途草稿（M1）、流无终帧（M2）、建会话去重（M3）、同一 requestId 重试（M4）、有限 Markdown、工具名、
// 计划"已插入讲解页"推断（T12 M2）、质量表只给当前诊断、预览页目录分组、下载链接只给产物地址加 token（M6）、冲突码统一。
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { chatReducer, retryOf, type ChatFrame, type PrepSession, type PrepTranscriptItem } from '../lib/chat-state'
import { createChatController, RELOAD_AFTER_FAILURE_MS, type ChatControllerDeps } from '../chat/controller'
import { ChatMarkdown, NEUTRAL_TOOL_LABEL, toolLabel } from '../chat/markdown'
import { clipText, currentDiagnostic, explanationInsertedAfter } from '../panel/view-model'
import { downloadHref } from '../lib/artifact-url'
import { isRequestConflict, REQUEST_CONFLICT_TEXT, errorText } from '../errors'
import { PrepApiError } from '../lib/api'
import QualityView from '../panel/QualityView'
import type { PrepWorkbench } from '../lib/panel-model'

vi.mock('@/lib/mainline/presentation/presentation-pages', () => ({
  lessonPresentationPages: (course: { __pages: unknown[] }) => course.__pages,
  presentationScene: (page: { scene: unknown }) => page.scene,
}))
vi.mock('@/lib/mainline/presentation/course-display-title', () => ({
  courseDisplayScene: (_course: unknown, scene: unknown) => scene,
  sceneDisplayTitle: (_course: unknown, scene: { visualFocus: string }) => scene.visualFocus,
}))
const { pageGroups, COURSE_LEVEL_LABEL } = await import('../panel/preview-model')

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')
const session: PrepSession = { id: 's-1', title: 't', courseId: null, createdAt: 1, updatedAt: 1 }
const done = (id: string, content = '好了'): ChatFrame => ({ type: 'done', runId: `run-${id}`, message: { id: `m-${id}`, content, createdAt: 2 }, tools: [], outcome: 'completed', session })
const item = (id: string, requestId: string, role: PrepTranscriptItem['role'], content: string): PrepTranscriptItem => ({ id, runId: `run-${requestId}`, requestId, role, content, createdAt: 1 })

describe('M1：轮询落地时不抹掉在途的草稿', () => {
  it('在途请求在服务端只有老师行时保留本地草稿，之后的 delta 与 done 照常落上去', () => {
    let s = chatReducer([], { type: 'sent', requestId: 'r1', content: '生成全部页' })
    s = chatReducer(s, { type: 'frame', requestId: 'r1', frame: { type: 'delta', delta: '正在' } })
    // 另一条消息的轮询：服务端有更早一条已完成的消息，r1 只有老师行（running）
    s = chatReducer(s, { type: 'loaded', inflight: ['r1'], messages: [item('run-r0:teacher', 'r0', 'teacher', '早先'), item('m-r0', 'r0', 'assistant', '早先的回复'), item('run-r1:teacher', 'r1', 'teacher', '生成全部页')] })
    expect(s.map((m) => [m.role, m.content])).toEqual([['teacher', '早先'], ['assistant', '早先的回复'], ['teacher', '生成全部页'], ['draft', '正在']])
    s = chatReducer(s, { type: 'frame', requestId: 'r1', frame: { type: 'delta', delta: '生成' } })
    s = chatReducer(s, { type: 'frame', requestId: 'r1', frame: done('r1', '17 页都生成好了') })
    expect(s.map((m) => [m.role, m.content])).toEqual([['teacher', '早先'], ['assistant', '早先的回复'], ['teacher', '生成全部页'], ['assistant', '17 页都生成好了']])
  })
  it('服务端已经有结果的在途请求以服务端为准；不在途的本地草稿被替换', () => {
    let s = chatReducer([], { type: 'sent', requestId: 'r1', content: '你好' })
    s = chatReducer(s, { type: 'loaded', inflight: ['r1'], messages: [item('run-r1:teacher', 'r1', 'teacher', '你好'), item('m-r1', 'r1', 'assistant', '回复')] })
    expect(s.map((m) => m.key)).toEqual(['run-r1:teacher', 'm-r1'])
    const t = chatReducer(chatReducer([], { type: 'sent', requestId: 'r2', content: '再来' }), { type: 'loaded', messages: [item('run-r2:teacher', 'r2', 'teacher', '再来')] })
    expect(t.map((m) => m.key)).toEqual(['run-r2:teacher'])
  })
  it('没到达服务端的本地失败保留错误行（可重试）；服务端有了这条记录就以服务端为准', () => {
    let s = chatReducer([], { type: 'sent', requestId: 'r3', content: '断网那条' })
    s = chatReducer(s, { type: 'failed', requestId: 'r3', error: '连接中断了' })
    const kept = chatReducer(s, { type: 'loaded', messages: [] })
    expect(kept.map((m) => [m.role, m.content])).toEqual([['teacher', '断网那条'], ['error', '连接中断了']])
    expect(retryOf(kept, kept[1]!)).toEqual({ requestId: 'r3', content: '断网那条' })
    const replaced = chatReducer(s, { type: 'loaded', messages: [item('run-r3:teacher', 'r3', 'teacher', '断网那条')] })
    expect(replaced.map((m) => m.key)).toEqual(['run-r3:teacher'])
  })
})

describe('M4：错误行用同一个 requestId 重试', () => {
  it('服务端记录里的错误行也能重试；重发时去掉这个 requestId 的所有旧行', () => {
    const s = chatReducer([], { type: 'loaded', messages: [item('run-r5:teacher', 'r5', 'teacher', '生成第 3 页'), { ...item('run-r5:error', 'r5', 'error', '等了太久'), code: 'timeout' }] })
    const retry = retryOf(s, s[1]!)
    expect(retry).toEqual({ requestId: 'r5', content: '生成第 3 页' })
    const resent = chatReducer(s, { type: 'sent', requestId: retry!.requestId, content: retry!.content })
    expect(resent.map((m) => [m.key, m.role])).toEqual([['teacher:r5', 'teacher'], ['draft:r5', 'draft']])
    expect(retryOf(s, s[0]!)).toBeNull()
  })
})

function harness(sendImpl: ChatControllerDeps['api']['send']) {
  const actions: Array<Parameters<ChatControllerDeps['dispatch']>[0]> = []
  const reloads: Array<[string, number]> = []
  const viewing = { current: null as string | null }
  const createSession = vi.fn(async () => { await new Promise((r) => setTimeout(r, 20)); return { session } })
  const send = vi.fn(sendImpl)
  const deps: ChatControllerDeps = {
    api: { createSession, send } as unknown as ChatControllerDeps['api'],
    dispatch: (a) => { actions.push(a) },
    courseId: () => 'c-1',
    viewing,
    sessionCreated: () => undefined,
    frame: () => undefined,
    reload: (id, ms) => { reloads.push([id, ms]) },
    inflightChanged: () => undefined,
  }
  return { controller: createChatController(deps), actions, reloads, viewing, createSession, send }
}

describe('发送流程（controller）', () => {
  it('M3：还没有会话时连发两条只建一个会话，两条都发到它，帧都落到各自的草稿上', async () => {
    const h = harness(async (_sid, body, onFrame) => { onFrame({ type: 'delta', delta: `回:${body.content}` }); onFrame(done(body.requestId)); return 'streamed' })
    await Promise.all([h.controller.send('第一条'), h.controller.send('第二条')])
    expect(h.createSession).toHaveBeenCalledTimes(1)
    expect(h.send.mock.calls.map((c) => c[0])).toEqual(['s-1', 's-1'])
    expect(h.viewing.current).toBe('s-1')
    expect(h.actions.filter((a) => a.type === 'frame')).toHaveLength(4)
    expect(h.reloads).toEqual([])
  })
  it('建会话失败后可以再试', async () => {
    const h = harness(async () => 'streamed')
    h.createSession.mockRejectedValueOnce(new Error('offline'))
    await h.controller.send('一')
    expect(h.actions.at(-1)).toMatchObject({ type: 'failed' })
    await h.controller.send('二')
    expect(h.createSession).toHaveBeenCalledTimes(2)
  })
  it('M2：流结束却没有 done/error 帧时重读会话记录；202（还在处理）同样重读', async () => {
    const h = harness(async (_sid, _body, onFrame) => { onFrame({ type: 'delta', delta: '半截' }); return 'streamed' })
    await h.controller.send('会断的那条')
    expect(h.reloads).toEqual([['s-1', 0]])
    const r = harness(async () => 'running')
    await r.controller.send('重发')
    expect(r.reloads).toEqual([['s-1', 0]])
  })
  it('M4：断网后用同一个 requestId 重试；同一个 requestId 在途时不重复发', async () => {
    let attempt = 0
    let release: () => void = () => undefined
    const h = harness(async (_sid, body, onFrame) => {
      attempt += 1
      if (attempt === 1) throw new TypeError('Failed to fetch')
      await new Promise<void>((r) => { release = r })
      onFrame(done(body.requestId))
      return 'streamed'
    })
    await h.controller.send('生成 17 页', 'req-retry-0001')
    expect(h.actions.at(-1)).toMatchObject({ type: 'failed', requestId: 'req-retry-0001' })
    expect(h.reloads).toEqual([['s-1', RELOAD_AFTER_FAILURE_MS]])
    const retrying = h.controller.send('生成 17 页', 'req-retry-0001')
    await new Promise((r) => setTimeout(r, 30))
    expect(h.controller.isInflight('req-retry-0001')).toBe(true)
    await h.controller.send('生成 17 页', 'req-retry-0001')
    release()
    await retrying
    expect(h.send.mock.calls.map((c) => c[1].requestId)).toEqual(['req-retry-0001', 'req-retry-0001'])
    expect(h.controller.inflight()).toEqual([])
  })
  it('PrepChat 用 controller 发送，错误行给"重试"，轮询带上在途的 requestId；帧只落到发起时的会话', () => {
    const src = read('app/prep/chat/PrepChat.tsx')
    expect(src).toContain('chat.send(retry.content, retry.requestId)')
    expect(src).toContain("inflight: chat.inflight()")
    expect(read('app/prep/chat/controller.ts')).toContain('if (deps.viewing.current !== started.id) return')
  })
})

describe('有限 Markdown（不用 dangerouslySetInnerHTML）', () => {
  const html = (text: string) => renderToStaticMarkup(createElement(ChatMarkdown, { text }))
  it('粗体、行内代码、列表、标题行、换行', () => {
    const out = html('## 结果\n**17 页**都生成好了，用了 `generate_page`。\n第二行\n\n- 第一条\n- 第二条\n\n1. 甲\n2. 乙')
    expect(out).toContain('<p><strong>结果</strong></p>')
    expect(out).toContain('<strong>17 页</strong>都生成好了，用了 <code>generate_page</code>。<br/>第二行')
    expect(out).toContain('<ul><li>第一条</li><li>第二条</li></ul>')
    expect(out).toContain('<ol start="1"><li>甲</li><li>乙</li></ol>')
    expect(out).not.toContain('##')
    expect(out).not.toContain('**')
  })
  it('HTML 与脚本原样显示成文字，链接与图片语法不生成元素', () => {
    const out = html('<script>alert(1)</script>\n<img src=x onerror="alert(2)">\n**<b>粗</b>**\n[点我](javascript:alert(3))\n```\n<iframe src="x"></iframe>\n```')
    expect(out).not.toMatch(/<script|<img|<b>|<iframe|<a |href=|onerror="/)
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(out).toContain('&lt;img src=x onerror=&quot;alert(2)&quot;&gt;')
    expect(out).toContain('<strong>&lt;b&gt;粗&lt;/b&gt;</strong>')
    expect(out).toContain('&lt;iframe src=&quot;x&quot;&gt;&lt;/iframe&gt;')
  })
  it('prep 源码里没有 dangerouslySetInnerHTML', () => {
    const files = ['chat/markdown.tsx', 'chat/PrepChat.tsx', ...readdirSync(resolve(process.cwd(), 'app/prep/panel')).map((f) => `panel/${f}`)]
    for (const f of files) expect([f, read(`app/prep/${f}`).includes('dangerouslySetInnerHTML')]).toEqual([f, false])
  })
})

describe('工具名', () => {
  it('已知的备课工具给中文，没见过的原样，没有名字给中性说法（不再一律"工具"）', () => {
    expect(toolLabel('generate_page')).toBe('生成页面')
    expect(toolLabel('repair_page')).toBe('修改页面')
    expect(toolLabel('some_new_tool')).toBe('some_new_tool')
    expect(toolLabel(undefined)).toBe(NEUTRAL_TOOL_LABEL)
    expect(NEUTRAL_TOOL_LABEL).not.toBe('工具')
    expect(toolLabel('toString')).toBe('toString')
  })
})

describe('计划："已插入讲解页"从计划数据推断（T12 M2）', () => {
  const page = (id: string, order: number, purpose = 'observe', image = false) => ({ id, order, purpose, visualSpec: image ? { required: true, form: 'instructional-image' } : { required: false, form: 'none' } })
  it('原页后面紧跟一张手动插入的讲解页 = 已插入，再点只删不再插', () => {
    expect(explanationInsertedAfter([page('c:p1', 1), page('c:p2', 2, 'observe', true), page('c:manual:1', 3, 'explain'), page('c:p3', 4)], 'c:p2')).toBe(true)
    expect(explanationInsertedAfter([page('c:p2', 2, 'observe', true), page('c:manual:1', 1, 'explain')], 'c:p2')).toBe(false)
    expect(explanationInsertedAfter([page('c:p2', 1, 'observe', true), page('c:p3', 2, 'explain')], 'c:p2')).toBe(false)
    expect(explanationInsertedAfter([page('c:p2', 1, 'observe', true), page('c:manual:2', 2, 'explain', true)], 'c:p2')).toBe(false)
    expect(explanationInsertedAfter([page('c:p2', 1, 'observe', true)], 'c:p2')).toBe(false)
    expect(read('app/prep/panel/PlanView.tsx')).toContain('explanationInsertedAfter(planning.pages, pageId)')
  })
})

describe('质量表（T15 走查第 3、4 条）', () => {
  it('"最近诊断"只给当前仍被拦下的页；修好通过的页不再显示旧的不通过文字', () => {
    expect(currentDiagnostic({ status: 'blocked', lastDiagnostic: '单页事实核查未通过：…' })).toBe('单页事实核查未通过：…')
    for (const status of ['passed', 'content-ready', 'queued', 'running']) expect(currentDiagnostic({ status, lastDiagnostic: '单页事实核查未通过：…' })).toBeNull()
  })
  it('长文字收起，按码点截断', () => {
    expect(clipText('短')).toEqual({ short: '短' })
    const long = '😀'.repeat(70)
    expect(clipText(long)).toEqual({ short: `${'😀'.repeat(60)}…`, full: long })
  })
  it('表格固定列宽；旧诊断不出现；长诊断放进可展开的 details', () => {
    const rows = [
      { pageId: 'p6', order: 6, purpose: 'explain', needsImage: false, status: 'passed', lastDiagnostic: '单页事实核查未通过：旧的', render: null, accepted: false },
      { pageId: 'p7', order: 7, purpose: 'explain', needsImage: false, status: 'blocked', lastDiagnostic: `单页事实核查未通过：${'很长的诊断'.repeat(20)}`, render: null, accepted: false },
    ]
    const w = { course: { generationSession: { status: 'rendering', jobs: [] }, sourceMaterial: [] }, summary: { sessionStatus: 'rendering', pages: rows }, teachingAudit: null, unacceptedPageIds: [], auditBlocked: null, exportReady: { ok: false, message: '', blockers: null } } as unknown as PrepWorkbench
    const out = renderToStaticMarkup(createElement(QualityView, { courseId: 'c1', workbench: w, onChanged: () => undefined }))
    expect(out).toMatch(/<table class="[^"]*qualityTable/)
    expect(out).not.toContain('旧的')
    expect(out).toMatch(/<details[^>]*><summary>单页事实核查未通过：/)
  })
})

describe('预览页目录（T15 走查第 2 条）', () => {
  it('按展示页顺序把连续同片段的页成组，组名带知识点与页码范围；同一幕的页不会被拉到前面的组里', () => {
    const scene = (id: string, title: string) => ({ id, visualFocus: title })
    const pg = (id: string, sceneId: string, title: string) => ({ id, sourceSceneId: sceneId, scene: scene(sceneId, title) })
    const course = {
      __pages: [pg('p1', 's0', '导入'), pg('p2', 'sA', '甲一'), pg('p3', 'sA', '甲二'), pg('p4', 'sB', '乙一'), pg('p5', 'sA', '甲三'), pg('p6', 'sZ', '小结')],
      learningFragments: [{ id: 'f0', sceneIds: ['s0', 'sZ'] }, { id: 'fA', kpId: 'kA', sceneIds: ['sA'] }, { id: 'fB', kpId: 'kB', sceneIds: ['sB'] }],
      sourceMaterial: [{ kpId: 'kA', title: '知识点甲' }, { kpId: 'kB', title: '知识点乙' }],
    }
    const groups = pageGroups(course as never)
    expect(groups.map((g) => [g.label, g.pages.map((p) => p.number)])).toEqual([
      [`${COURSE_LEVEL_LABEL} · 第 1 页`, [1]],
      ['知识点甲 · 第 2–3 页', [2, 3]],
      ['知识点乙 · 第 4 页', [4]],
      ['知识点甲 · 第 5 页', [5]],
      [`${COURSE_LEVEL_LABEL} · 第 6 页`, [6]],
    ])
    expect(new Set(groups.map((g) => g.key)).size).toBe(groups.length)
    expect(groups.flatMap((g) => g.pages.map((p) => p.title))).toEqual(['导入', '甲一', '甲二', '乙一', '甲三', '小结'])
  })
  it('预览舞台放进 16:9 的框里按面板宽度缩放，不再用迁入的 StructureTree', () => {
    const src = read('app/prep/panel/PagePreview.tsx')
    expect(src).toContain('<div className={styles.stageFrame}><PreviewStage')
    expect(src).not.toContain('<StructureTree')
    const css = read('app/prep/prep.module.css')
    expect(css).toMatch(/\.stageFrame \{[^}]*aspect-ratio: 16 \/ 9/)
    expect(css).toMatch(/\.previewLayout \{[^}]*minmax\(0, 1fr\)/)
    expect(css).toMatch(/\.tabs \{[^}]*background: var\(--paper/)
  })
})

describe('下载链接与冲突码', () => {
  const tokenize = (url: string) => `${url}${url.includes('?') ? '&' : '?'}token=t`
  it('M6：只给产物地址加 token', () => {
    expect(downloadHref('/api/prep/artifacts/x', 'a.pptx', tokenize)).toBe('/api/prep/artifacts/x?name=a.pptx&token=t')
    expect(downloadHref('https://evil.example/x', 'a.pptx', tokenize)).toBe('https://evil.example/x?name=a.pptx')
    expect(downloadHref('/api/prep/render/c/x', null, tokenize)).toBe('/api/prep/render/c/x')
    expect(read('app/prep/panel/ExportView.tsx')).toContain("isArtifactUrl(latest.href.split('?')[0]!)")
  })
  it('请求编号冲突统一为 REQUEST_KEY_CONFLICT；旧码不再特殊处理', () => {
    expect(isRequestConflict(new PrepApiError(409, { error: 'x', code: 'REQUEST_KEY_CONFLICT' }))).toBe(true)
    expect(errorText(new PrepApiError(409, { error: 'x', code: 'REQUEST_KEY_CONFLICT' }), '兜底')).toBe(REQUEST_CONFLICT_TEXT)
    expect(isRequestConflict(new PrepApiError(409, { error: '原文', code: 'REQUEST_CONFLICT' }))).toBe(false)
  })
})

