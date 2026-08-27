import Link from 'next/link'
import { listMainlineCourses } from './lib/mainline/store.js'

export default async function Home() {
  let mainlineCount = 0
  try {
    mainlineCount = (await listMainlineCourses()).length
  } catch {
    mainlineCount = 0
  }

  return (
    <main style={{ minHeight: '100vh', background: '#fafaf7', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '32px 48px' }}>
        <strong style={{ fontSize: 18, letterSpacing: '-0.02em' }}>Maolab</strong>
      </header>

      <section style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 1000, width: '100%' }}>
          <h1 style={{ fontSize: 'clamp(36px, 5vw, 72px)', fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.02em', marginBottom: 16 }}>
            说一句话，<br />
            上一节课。
          </h1>
          <p style={{ color: '#6b7280', fontSize: 18, lineHeight: 1.7, maxWidth: 640, marginBottom: 56 }}>
            告诉 AI 你想教什么，几分钟后拿到完整的课件。
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <Link
              href="/mainline/create"
              style={{
                display: 'block',
                padding: '36px 32px',
                background: '#111827',
                color: '#fff',
                borderRadius: 16,
                textDecoration: 'none',
                position: 'relative',
              }}
            >
              <div style={{ position: 'absolute', top: 14, right: 16, fontSize: 11, letterSpacing: '0.1em', color: '#f0c978', fontWeight: 700 }}>MAINLINE</div>
              <div style={{ fontSize: 32, fontWeight: 700, marginBottom: 10 }}>做一节新课</div>
              <div style={{ fontSize: 15, opacity: 0.85, lineHeight: 1.6 }}>
                从教材选知识点,即时编译成 4 幕低交互空骨架课程。
              </div>
            </Link>

            <Link
              href="/mainline"
              style={{
                display: 'block',
                padding: '36px 32px',
                background: '#fff',
                color: '#111827',
                border: '1px solid #e5e7eb',
                borderRadius: 16,
                textDecoration: 'none',
              }}
            >
              <div style={{ fontSize: 32, fontWeight: 700, marginBottom: 10 }}>上课</div>
              <div style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.6 }}>
                {mainlineCount > 0 ? `${mainlineCount} 门课在库,选一节开始` : '还没有课,先做一节'}
              </div>
            </Link>
          </div>
        </div>
      </section>

      <footer style={{ padding: '24px 48px', fontSize: 12, color: '#9ca3af' }}>
        本系统由 云一工作室 开发维护。
      </footer>
    </main>
  )
}
