'use client'

// 备课对话：一个会话一条记录（course.prep_sessions）。发消息带 requestId；断线或 202 时改为轮询会话记录，不重复发。
// 备课排队不抢占：上一条没完也可以继续发，后面的显示"排队中"。取消会同时丢弃这个会话里排队的消息（网关语义），按钮上写明。
// outcome 为 failed 的 done 帧由 chatReducer 渲染成错误行；请求编号冲突（REQUEST_KEY_CONFLICT）按 errorText 说明。
// 过期守卫（review I1）：viewing 记着当前显示的会话；会话加载与重试只认最新一次（createLatest），切换会话时全部作废；
// 流式回复进行中禁用会话选择，帧也只在发起它的会话仍在显示时落到列表上。重试一律经 pollTimer，切换时一起清掉。
// 终审修复：发送流程在 controller.ts（建会话去重 M3、流无终帧时重读 M2、同一 requestId 重试 M4）；
// 轮询带上本页在途的 requestId，不抹掉正在流式输出的草稿（M1）；回复按有限 Markdown 显示；工具名用中文或中性说法。
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { prepApi } from '../lib/api'
import { chatReducer, retryOf, type ChatFrame, type PrepSession } from '../lib/chat-state'
import { errorText } from '../errors'
import { createLatest } from './latest'
import { createChatController } from './controller'
import { ChatMarkdown, toolLabel } from './markdown'
import styles from '../prep.module.css'

export default function PrepChat({ courseId, hasCredential, onCourseTouched }: { courseId: string | null; hasCredential: boolean; onCourseTouched(courseId: string | null): void }) {
  const [sessions, setSessions] = useState<PrepSession[]>([])
  const [session, setSession] = useState<PrepSession | null>(null)
  const [items, dispatch] = useReducer(chatReducer, [])
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [inFlight, setInFlight] = useState(0)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const viewing = useRef<string | null>(null)
  const latest = useRef(createLatest())
  const courseRef = useRef(courseId)
  courseRef.current = courseId
  const touchedRef = useRef(onCourseTouched)
  touchedRef.current = onCourseTouched
  const loadRef = useRef<(id: string) => Promise<void>>(async () => undefined)
  const clearPoll = () => { if (pollTimer.current) { clearTimeout(pollTimer.current); pollTimer.current = null } }

  const controller = useRef<ReturnType<typeof createChatController> | null>(null)
  controller.current ??= createChatController({
    api: prepApi,
    dispatch,
    courseId: () => courseRef.current,
    viewing,
    sessionCreated: (created) => { setSession(created); setSessions((list) => [created, ...list]) },
    frame: (frame: ChatFrame) => {
      if (frame.type === 'tool') touchedRef.current(frame.courseId ?? null)
      if (frame.type === 'done') { setSession(frame.session); touchedRef.current(frame.session.courseId) }
    },
    reload: (id, delayMs) => {
      clearPoll()
      if (delayMs <= 0) { void loadRef.current(id); return }
      pollTimer.current = setTimeout(() => { void loadRef.current(id) }, delayMs)
    },
    inflightChanged: setInFlight,
  })
  const chat = controller.current

  useEffect(() => { void prepApi.sessions().then((r) => setSessions(r.sessions)).catch(() => undefined) }, [])

  const load = useCallback(async (id: string) => {
    clearPoll()
    const ticket = latest.current.begin(id)
    const stale = () => !latest.current.isCurrent(ticket) || viewing.current !== id
    try {
      const r = await prepApi.session(id)
      if (stale()) return
      chat.setSession(r.session)
      setSession(r.session)
      // M1：本页在途的请求保留草稿，之后的帧照常落上去
      dispatch({ type: 'loaded', messages: r.messages, inflight: chat.inflight() })
      setError('')
      if (r.session.courseId) touchedRef.current(r.session.courseId)
      if (r.running.length > 0) pollTimer.current = setTimeout(() => { void load(id) }, 4000)
    } catch (e) {
      if (stale()) return
      setError(errorText(e, '对话记录读取失败，稍后会自动重试。'))
      pollTimer.current = setTimeout(() => { void load(id) }, 6000)
    }
  }, [chat])
  loadRef.current = load
  useEffect(() => () => { latest.current.invalidate(); clearPoll() }, [])

  function select(id: string) {
    latest.current.invalidate()
    clearPoll()
    setError('')
    viewing.current = id || null
    if (id) { void load(id); return }
    chat.setSession(null)
    setSession(null)
    dispatch({ type: 'loaded', messages: [] })
  }

  function send() {
    const content = text.trim()
    if (!content) return
    setError('')
    setText('')
    void chat.send(content)
  }

  async function cancel() {
    if (!session) return
    try { await prepApi.cancel(session.id) } catch (e) { setError(errorText(e, '停止没有完成，请稍后再试。')) }
    await load(session.id)
  }

  return (
    <>
      <div className={styles.row} style={{ padding: '8px 12px' }}>
        <select aria-label="选择备课对话" disabled={inFlight > 0} title={inFlight > 0 ? '回复进行中，完成后才能切换对话' : undefined} value={session?.id ?? ''} onChange={(e) => select(e.target.value)}>
          <option value="">新的备课对话</option>
          {sessions.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
        {inFlight > 0 ? <button type="button" onClick={() => void cancel()}>停止（也会丢掉排队的消息）</button> : null}
      </div>
      {!hasCredential ? <p className={styles.hint}>备课助理要用你自己的云一账号调用模型：请用云一账号登录。右侧面板仍可查看与管理课程。</p> : null}
      <div className={styles.messages} aria-live="polite">
        {items.map((m) => {
          const retry = retryOf(items, m)
          return (
            <div key={m.key} className={styles[m.role]}>
              {m.role === 'assistant' || (m.role === 'draft' && m.content) ? <ChatMarkdown text={m.content} /> : (m.content || (m.role === 'draft' ? '…' : ''))}
              {m.status && m.role === 'draft' ? <div className={styles.status}>{m.status}</div> : null}
              {m.tools.length > 0 ? (
                <div className={styles.tools}>
                  {m.tools.map((t, i) => <span key={i} className={t.ok ? styles.toolOk : styles.toolFail}>{toolLabel(t.name)}{t.ok ? '' : `：${t.reason ?? '未完成'}`}</span>)}
                </div>
              ) : null}
              {retry ? (
                <div className={styles.row}>
                  <button type="button" disabled={!hasCredential || chat.isInflight(retry.requestId)} title="用同一个请求编号重发这条消息：已经在处理或已经完成的不会重复处理" onClick={() => void chat.send(retry.content, retry.requestId)}>重试</button>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      <form className={styles.composer} onSubmit={(e) => { e.preventDefault(); send() }}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={courseId ? '对备课助理说：继续生成下一页、按审查意见修第 3 页……' : '先在右侧选知识点建课，或直接告诉备课助理你要上的课'} disabled={!hasCredential} maxLength={4000} />
        <button className={styles.primary} type="submit" disabled={!hasCredential || !text.trim()}>发送</button>
      </form>
    </>
  )
}
