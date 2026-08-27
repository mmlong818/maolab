'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Sparkles, Plus, Library, Clock, Settings, LogOut } from 'lucide-react'

const PRIMARY_LINKS = [
  { href: '/courses', label: '课程库', icon: Library },
]

/** 在这些路径下隐藏整个 NavBar（纯净投影模式 + 课堂态 + 首页自带 hero） */
const HIDE_PREFIXES = ['/classroom/', '/teach/', '/v2/', '/live/', '/mainline/']
const HIDE_EXACT = ['/']

/** 当前页面的上下文标签
 *  规则：仅当当前页面 H1 不能表达"我在流程的哪一步"时才显示面包屑。
 *  各创建/审批页 H1 都是 topic 或 H1 已含进度条 → 一律不显示重复面包屑。
 */
function pathContext(pathname: string): string | null {
  if (pathname.startsWith('/setup/profile')) return '账户设置'
  // v2 全路径 H1 已自带语境，旧路径已 retired
  return null
}

export default function NavBar() {
  const pathname = usePathname() ?? '/'
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', esc)
    }
  }, [menuOpen])

  if (HIDE_PREFIXES.some(p => pathname.startsWith(p))) return null
  if (HIDE_EXACT.includes(pathname)) return null

  const context = pathContext(pathname)

  return (
    <nav
      className="sticky top-0 z-40 border-b backdrop-blur-md"
      style={{
        borderColor: 'var(--border-subtle)',
        background: 'color-mix(in srgb, var(--bg-page) 75%, transparent)',
      }}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-6">
        {/* Logo + 品牌（跳首页，由 root redirect 决定去向） */}
        <Link
          href="/"
          className="group flex items-center gap-2 shrink-0"
          style={{ color: 'var(--fg-primary)' }}
        >
          <span
            className="inline-flex h-7 w-7 items-center justify-center rounded-md transition-transform group-hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, var(--brand-500), var(--brand-700))',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <Sparkles size={14} strokeWidth={2.5} color="white" />
          </span>
          <span
            className="font-semibold tracking-tight"
            style={{ fontFamily: 'var(--font-display)', fontSize: '14px', letterSpacing: '-0.01em' }}
          >
            Maolab
          </span>
        </Link>

        {/* 上下文面包屑 */}
        {context && (
          <>
            <span
              aria-hidden
              style={{ color: 'var(--fg-tertiary)', fontSize: 12 }}
            >
              ／
            </span>
            <span
              className="truncate text-sm"
              style={{
                color: 'var(--fg-secondary)',
                fontFamily: 'var(--font-display)',
                fontWeight: 500,
                letterSpacing: '-0.005em',
              }}
            >
              {context}
            </span>
          </>
        )}

        {/* 推到右侧 */}
        <div className="ml-auto flex items-center gap-0.5">
          {PRIMARY_LINKS.filter(link => !pathname.startsWith(link.href)).map((link) => {
            const Icon = link.icon
            return (
              <Link
                key={link.href}
                href={link.href}
                title={link.label}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-[var(--bg-subtle)]"
                style={{
                  color: 'var(--fg-secondary)',
                  background: 'transparent',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 500,
                }}
              >
                <Icon size={14} strokeWidth={2} />
                <span className="hidden md:inline">{link.label}</span>
              </Link>
            )
          })}

          {/* 主 CTA（在创建流程或课程库中隐藏，因为这些页面有自己的 CTA） */}
          {!pathname.startsWith('/create') && !pathname.startsWith('/plan/') && !pathname.startsWith('/method/') && !pathname.startsWith('/rundown/') && !pathname.startsWith('/v2-preview/') && !pathname.startsWith('/courses') && (
            <Link
              href="/create"
              className="ml-2 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-semibold text-white transition-all hover:opacity-90 hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: 'linear-gradient(135deg, var(--brand-500), var(--brand-700))',
                fontFamily: 'var(--font-display)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05), 0 0 0 1px color-mix(in srgb, var(--brand-700) 30%, transparent)',
              }}
            >
              <Plus size={14} strokeWidth={2.5} /> 新建
            </Link>
          )}

          {/* 头像 + 下拉菜单（含设置等） */}
          <div ref={menuRef} className="relative ml-2">
            <button
              type="button"
              aria-label="账户菜单"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(v => !v)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, #fbbf24, #ea580c)',
                color: '#fff',
                fontFamily: 'var(--font-display)',
                boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.4)',
              }}
            >
              猫
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-2 min-w-[180px] rounded-lg border py-1.5 shadow-lg"
                style={{
                  background: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                  fontFamily: 'var(--font-display)',
                  boxShadow: 'var(--shadow-lg)',
                }}
              >
                <Link
                  role="menuitem"
                  href="/setup/profile"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-[var(--bg-hover)]"
                  style={{ color: 'var(--fg-primary)' }}
                >
                  <Settings size={14} strokeWidth={2} />
                  设置
                </Link>
                <div className="my-1 border-t" style={{ borderColor: 'var(--border-subtle)' }} />
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  disabled
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm opacity-50 cursor-not-allowed"
                  style={{ color: 'var(--fg-secondary)' }}
                  title="尚未实现"
                >
                  <LogOut size={14} strokeWidth={2} />
                  退出登录
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
