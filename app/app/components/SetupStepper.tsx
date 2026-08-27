'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { CourseV2 } from '@maolab/shared-types'

type StepKey = 'create' | 'audit' | 'plan' | 'method' | 'rundown' | 'showscript' | 'script' | 'atoms'

const STEPS: { key: StepKey; label: string; route: (id: string) => string }[] = [
  { key: 'create', label: '内容', route: () => '/create' },
  { key: 'audit', label: '完整度', route: id => `/audit/${id}` },
  { key: 'plan', label: '目标', route: id => `/plan/${id}` },
  { key: 'method', label: '教法', route: id => `/method/${id}` },
  { key: 'rundown', label: '提纲', route: id => `/rundown/${id}` },
  { key: 'showscript', label: '剧本', route: id => `/showscript/${id}` },
  { key: 'script', label: '讲稿', route: id => `/script/${id}` },
  { key: 'atoms', label: '内容页', route: id => `/atoms/${id}` },
]

function parsePath(pathname: string): { stepKey: StepKey | 'v2-preview' | null; courseId: string | null } {
  const m = pathname.match(/^\/(create|audit|plan|method|rundown|showscript|script|atoms|v2-preview)(?:\/([^/]+))?/)
  if (!m) return { stepKey: null, courseId: null }
  return { stepKey: (m[1] ?? null) as StepKey | 'v2-preview' | null, courseId: m[2] ?? null }
}

function availableSteps(course: CourseV2 | null, current: StepKey): Set<StepKey> {
  const out = new Set<StepKey>(['create'])
  if (!course) {
    out.add(current)
    return out
  }
  out.add('audit')
  if (course.teachingPlan) out.add('plan')
  if (course.methodPlan) out.add('method')
  if (course.rundown) out.add('rundown')
  if (course.showScript || course.status === 'rundown-approved') out.add('showscript')
  if (course.scriptDocs || course.status === 'scripting' || course.status === 'scripted') out.add('script')
  if ((course.atoms?.length ?? 0) > 0 || course.status === 'atom-generating' || course.status === 'ready') out.add('atoms')
  out.add(current)
  return out
}

export default function SetupStepper() {
  const pathname = usePathname()
  const router = useRouter()
  const { stepKey, courseId } = parsePath(pathname)
  const [course, setCourse] = useState<CourseV2 | null>(null)

  useEffect(() => {
    if (!courseId) {
      setCourse(null)
      return
    }
    let cancelled = false
    void fetch(`/api/v2/course-state/${courseId}`)
      .then(r => r.ok ? r.json() as Promise<{ course: CourseV2 }> : null)
      .then(j => {
        if (!cancelled) setCourse(j?.course ?? null)
      })
      .catch(() => {
        if (!cancelled) setCourse(null)
      })
    return () => { cancelled = true }
  }, [courseId])

  if (!stepKey || stepKey === 'v2-preview') return null

  const currentIdx = STEPS.findIndex(s => s.key === stepKey)
  if (currentIdx < 0) return null

  const allowed = availableSteps(course, stepKey)
  let furthestIdx = currentIdx
  STEPS.forEach((s, i) => {
    if (allowed.has(s.key)) furthestIdx = Math.max(furthestIdx, i)
  })

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'rgba(250,250,247,0.92)',
      backdropFilter: 'blur(10px)',
      borderBottom: '1px solid #e5e7eb',
      padding: '14px 24px',
    }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        {STEPS.map((s, i) => {
          const isCurrent = i === currentIdx
          const isDone = i < furthestIdx && allowed.has(s.key)
          const isAvailable = allowed.has(s.key) && (s.key === 'create' || Boolean(courseId))
          const isClickable = isAvailable && !isCurrent
          const onClick = () => {
            if (!isClickable) return
            router.push(s.key === 'create' ? '/create' : s.route(courseId!))
          }
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                onClick={onClick}
                disabled={!isClickable}
                title={isAvailable ? s.label : '这一步还没开始'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 8,
                  cursor: isClickable ? 'pointer' : 'default',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (isClickable) e.currentTarget.style.background = '#f3f4f6' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{
                  width: 24, height: 24, borderRadius: 12,
                  background: isCurrent ? '#2563eb' : isDone ? '#10b981' : '#e5e7eb',
                  color: isCurrent || isDone ? '#fff' : '#9ca3af',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700,
                  flexShrink: 0,
                }}>{isDone ? '✓' : i + 1}</span>
                <span style={{
                  fontSize: 13,
                  color: isCurrent ? '#111827' : isDone ? '#10b981' : '#9ca3af',
                  fontWeight: isCurrent ? 700 : 500,
                }}>{s.label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <span style={{ width: 18, height: 1, background: i < furthestIdx ? '#10b981' : '#e5e7eb' }} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
