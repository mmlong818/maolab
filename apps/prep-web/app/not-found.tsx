import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl py-20 px-6">
      <div className="mb-3 text-sm font-mono text-[color:var(--fg-tertiary)]">ERR_404</div>
      <h1 className="text-3xl font-bold mb-3 text-[color:var(--fg-primary)]">找不到这个页面</h1>
      <p className="text-[color:var(--fg-secondary)] leading-relaxed mb-8">
        可能的原因：链接已失效、课程被删除、或路径已变更。
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/prep/"
          className="inline-flex items-center px-4 py-2 rounded-md bg-[color:var(--accent)] text-white text-sm font-medium hover:bg-[color:var(--accent-hover)] transition-colors"
        >
          回到备课室
        </Link>
      </div>
    </main>
  )
}
