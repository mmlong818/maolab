'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  heading: string
  subline: string
}

export default function WaitWithAutoReload({ heading, subline }: Props) {
  const router = useRouter()
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const reload = setInterval(() => router.refresh(), 4000)
    const tick = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => { clearInterval(reload); clearInterval(tick) }
  }, [router])

  // 超过 3 分钟提示偏慢, 5 分钟提示可以刷新重试
  const overtime = elapsed > 180
  const stuck = elapsed > 300
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60

  return (
    <main style={{ minHeight: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: 36, height: 36, border: '3px solid #e5e7eb', borderTopColor: '#2563eb', borderRadius: '50%', marginBottom: 20, animation: 'spin 0.9s linear infinite' }} />
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{heading}</div>
      <div style={{ fontSize: 13, color: '#6b7280' }}>{subline}</div>
      <div style={{ marginTop: 14, fontSize: 12, color: stuck ? '#dc2626' : overtime ? '#d97706' : '#9ca3af' }}>
        已等 {mins > 0 ? `${mins} 分 ` : ''}{secs} 秒
        {stuck && ' · 时间偏长，可刷新页面重试'}
        {!stuck && overtime && ' · 比平常慢一些，请再稍等'}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </main>
  )
}
