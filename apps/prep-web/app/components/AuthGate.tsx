'use client'

// 身份就绪后才渲染页面：未登录时 SDK 渲染全屏登录门（authReady 永不 resolve），页面里的接口请求不会先打出去。
// 账号未开启（单用户模式）时 authReady 立即得到空 token，页面照常渲染。
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Sparkles } from 'lucide-react'

import { apiFetch, authReady } from '@/lib/auth/client'

export interface AccountInfo {
  enabled: boolean
  user: {
    id: string
    displayName: string | null
    email: string | null
    channel: 'yunyi' | 'portal' | 'local'
    isAdmin: boolean
  }
  /** user：教学回答按该用户自己的云一额度计费；site：使用全站配置的模型密钥 */
  billing: 'user' | 'site'
}

const AccountContext = createContext<AccountInfo | null>(null)

export function useAccount(): AccountInfo | null {
  return useContext(AccountContext)
}

// 课件渲染页只给渲染 worker 用，数据来自 worker 的拦截，不经登录门
const PUBLIC_PATHS = ['/prep/render']

export default function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? ''
  const isPublic = PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
  const [account, setAccount] = useState<AccountInfo | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (isPublic) return
    let active = true
    void authReady()
      .then(() => apiFetch('/api/account/me', { cache: 'no-store' }))
      .then(async response => {
        if (!response.ok) throw new Error(String(response.status))
        const data = (await response.json()) as AccountInfo
        if (active) setAccount(data)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [isPublic])

  if (isPublic) return <>{children}</>
  if (account) return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>
  return (
    <div role={failed ? 'alert' : 'status'} style={{ display: 'grid', minHeight: '100vh', placeItems: 'center', gap: 10, color: 'var(--muted, #7e6f60)' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <Sparkles size={20} />
        {failed ? '暂时连不上备课室服务，请稍后刷新重试。' : '正在打开备课室…'}
      </span>
    </div>
  )
}
