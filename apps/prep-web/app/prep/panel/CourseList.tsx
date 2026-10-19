'use client'

import { useEffect, useRef, useState } from 'react'
import { prepApi, type PrepCourseRow } from '../lib/api'
import { errorText } from '../errors'
import KpPicker from './KpPicker'
import { courseStatusText } from './view-model'
import styles from '../prep.module.css'

// 建课有同步防双击（review M8）：creatingRef 在同一事件循环里就挡住第二次点击，busy 让按钮显示为不可点
export default function CourseList({ onSelect }: { onSelect(courseId: string): void }) {
  const [courses, setCourses] = useState<PrepCourseRow[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const creatingRef = useRef(false)
  useEffect(() => { void prepApi.courses().then((r) => setCourses(r.courses)).catch((e: unknown) => { setCourses([]); setError(errorText(e, '课程列表读取失败，请稍后重试。')) }) }, [])

  async function create(kpIds: string[]) {
    if (creatingRef.current) return
    creatingRef.current = true
    setBusy(true)
    setError('')
    try {
      const created = await prepApi.createCourse(kpIds)
      onSelect(created.course.courseId)
    } catch (e) {
      setError(errorText(e, '建课没有完成，请稍后重试。'))
    } finally {
      creatingRef.current = false
      setBusy(false)
    }
  }

  return (
    <div className={styles.section}>
      <div className={styles.row}>
        <strong>我的课程</strong>
        <button className={styles.primary} type="button" onClick={() => setCreating((v) => !v)}>{creating ? '收起' : '选知识点建课'}</button>
      </div>
      {creating ? <KpPicker busy={busy} onConfirm={(kps) => void create(kps.map((k) => k.kpId))} /> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {courses === null ? <p className={styles.status}>正在读取…</p> : courses.length === 0 ? <p className={styles.status}>还没有课程。</p> : (
        <ul>
          {courses.map((c) => (
            <li key={c.courseId}>
              <button type="button" className={styles.linkButton} onClick={() => onSelect(c.courseId)}>{c.topic}</button>
              <span className={styles.status}> {courseStatusText(c)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
