'use client'

import { useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface FillBannerProps {
  courseId: string
  qualityStatus: 'draft' | 'blocked' | 'passed'
  hasBlockingIssues: boolean
  hasImages: boolean
  factAuditPendingCount?: number
  surface?: 'classroom' | 'prep'
}

interface ApiFailure {
  error?: unknown
  reasons?: unknown
}

interface FillError {
  message: string
  reasons: string[]
}

export function FillBanner({
  courseId,
  qualityStatus,
  hasBlockingIssues,
  hasImages,
  factAuditPendingCount = 0,
  surface = 'classroom',
}: FillBannerProps) {
  const router = useRouter()
  const [busy, setBusy] = useState<null | 'text' | 'images'>(null)
  const [error, setError] = useState<FillError | null>(null)

  // 只有当前实时检查也无阻断时才算就绪；旧 passed 可能被后来新增的质量规则降级。
  if (qualityStatus === 'passed' && !hasBlockingIssues && hasImages && factAuditPendingCount === 0) return null

  async function callApi(endpoint: string, action: 'text' | 'images') {
    setBusy(action)
    setError(null)
    try {
      const res = await fetch(endpoint, { method: 'POST' })
      const j = await res.json().catch(() => ({})) as ApiFailure
      if (!res.ok) {
        setError({
          message: typeof j.error === 'string' ? j.error : `请求失败（HTTP ${res.status}）`,
          reasons: Array.isArray(j.reasons) ? j.reasons.filter((reason): reason is string => typeof reason === 'string') : [],
        })
        setBusy(null)
        return
      }
      router.refresh()
      window.setTimeout(() => window.location.reload(), 400)
    } catch (err) {
      setError({
        message: err instanceof Error ? err.message : '请求失败，请检查服务后重试。',
        reasons: [],
      })
      setBusy(null)
    }
  }

  const isFactAuditPending = factAuditPendingCount > 0
  const showText = qualityStatus !== 'passed' && !isFactAuditPending
  const showImages = qualityStatus === 'passed' && !hasImages
  // round13 真检发现:qualityStatus='blocked' 也可能来自 fill 之后的事实核查 FATAL
  // (一票否决,与调用方传入的结构闸门 hasBlockingIssues 是两条独立判定路径)——
  // 只看 hasBlockingIssues 会在"内容已真实生成但被 FATAL 拦下"时误报成"还是占位模板",
  // 老师会被引导去点"让 AI 填内容"而不知道真正卡点在事实核查。
  const isBlocked = hasBlockingIssues || qualityStatus === 'blocked' || isFactAuditPending
  const bannerColor = isBlocked ? '#e0ad9e' : '#e3d1a0'
  const bannerBg = isBlocked ? '#fdf6f4' : '#fbf7ec'
  const label = isFactAuditPending
    ? `教师修改了 ${factAuditPendingCount} 页事实内容，请逐页点击“核查本页”后再上课`
    : isBlocked
      ? '这门课有阻断问题,现在不能上课'
    : showText
      ? '当前是骨架占位内容,各幕文字都是模板;让 AI 填成针对本课的真实教学内容'
      : '文字已生成,教学画面幕(观察/辨析/收束)还是纯文字;让 AI 补上配图'

  const classroomLabel = isFactAuditPending
    ? `教师修改的 ${factAuditPendingCount} 页内容尚未重新核查，请回到备课逐页核查。`
    : isBlocked
      ? '上课前还有阻断问题，请先回到备课修正。'
    : showText
      ? '课程文字内容还未完成，请先进入备课修正。'
      : '文字内容已通过检查，但教学配图尚未生成；请先回到备课补图。'
  const isClassroomSurface = surface === 'classroom'

  return (
    <div className={`mainline-fill-banner ${isClassroomSurface ? 'mainline-fill-banner--classroom' : ''}`} style={{
      position: isClassroomSurface ? 'fixed' : 'static',
      top: isClassroomSurface ? 12 : undefined,
      left: isClassroomSurface ? '50%' : undefined,
      transform: isClassroomSurface ? 'translateX(-50%)' : undefined,
      zIndex: 100,
      maxWidth: isClassroomSurface ? 780 : 'none',
      width: isClassroomSurface ? 'calc(100% - 24px)' : '100%',
      padding: '12px 24px', borderRadius: isClassroomSurface ? 10 : 0,
      background: bannerBg, color: '#16181d',
      border: `1px solid ${bannerColor}`,
      boxShadow: isClassroomSurface ? '0 10px 30px -12px rgba(20,22,28,0.25)' : 'none',
      display: 'flex', alignItems: 'center', gap: 12,
      flexWrap: 'wrap',
      fontSize: 14,
    }}>
      <span style={{ flex: 1, lineHeight: 1.5 }}>{surface === 'classroom' ? classroomLabel : label}</span>
      {surface === 'classroom' ? (
        <Link href={`/mainline/${courseId}/prep`} style={prepLinkStyle}>
          进入备课修正
        </Link>
      ) : null}
      {surface === 'prep' && showText && (
        <button
          type="button"
          onClick={() => callApi(`/api/v2/mainline/fill/${courseId}`, 'text')}
          disabled={busy !== null}
          style={buttonStyle(busy === 'text')}
        >
          {busy === 'text' ? 'AI 填文字中…(~1 分钟)' : '让 AI 填内容'}
        </button>
      )}
      {surface === 'prep' && showImages && (
        <button
          type="button"
          onClick={() => callApi(`/api/v2/mainline/fill-images/${courseId}`, 'images')}
          disabled={busy !== null}
          style={buttonStyle(busy === 'images')}
        >
          {busy === 'images' ? '生成图像中…(~1 分钟)' : '让 AI 补图'}
        </button>
      )}
      {error && (
        <div role="alert" style={{ width: '100%', color: '#8f2f24', fontSize: 13, lineHeight: 1.55 }}>
          <strong>{error.message}</strong>
          {error.reasons.length > 0 && (
            <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
              {error.reasons.map((reason, index) => <li key={`${index}-${reason}`}>{reason}</li>)}
            </ul>
          )}
        </div>
      )}
      <style jsx>{`
        @media (max-width: 700px) {
          .mainline-fill-banner--classroom {
            top: 56px !important;
          }

          .mainline-fill-banner:not(.mainline-fill-banner--classroom) {
            position: static !important;
            width: 100% !important;
            margin: 0;
            transform: none !important;
          }
        }
      `}</style>
    </div>
  )
}

const prepLinkStyle: CSSProperties = {
  padding: '8px 16px', borderRadius: 8,
  border: '1px solid #8a4b2a', background: '#8a4b2a', color: '#fff',
  fontWeight: 700, fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap',
}

function buttonStyle(active: boolean): CSSProperties {
  return {
    padding: '8px 16px', borderRadius: 8,
    border: '1px solid #d39e45',
    background: active ? '#4a3e2a' : '#f0c978',
    color: active ? '#f0c978' : '#251b0d',
    fontWeight: 700, fontSize: 13, cursor: active ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
  }
}
