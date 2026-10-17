'use client'

// 侧栏底部的账号信息：名称、余额（按用户自己的云一额度计费时）、充值、退出登录。账号未开启时不渲染。
import { LogOut, RefreshCw, Wallet } from 'lucide-react'

import { useAccount } from '@/components/AuthGate'
import { logout } from '@/lib/auth/client'
import { canRecharge, formatBalance, openRecharge, refreshWallet, useWallet, walletEnabled } from '@/lib/auth/wallet'

import styles from './AccountMenu.module.css'

export default function AccountMenu() {
  const account = useAccount()
  const showWallet = Boolean(account?.enabled && account.billing === 'user')
  const wallet = useWallet(showWallet)
  if (!account?.enabled) return null

  const name = account.user.displayName || account.user.id
  const balance = () => {
    if (!showWallet) return <span className={styles.balance}>由备课室统一计费</span>
    if (!walletEnabled(wallet.data)) return null
    if (wallet.status === 'loading' || wallet.status === 'idle') return <span className={styles.balance}>余额查询中…</span>
    if (wallet.status === 'error') {
      return (
        <span className={styles.balance}>
          余额查询失败
          <button type="button" className={styles.link} onClick={() => void refreshWallet()}>
            <RefreshCw size={12} />
            重试
          </button>
        </span>
      )
    }
    const text = formatBalance(wallet.data!, '不限额') ?? '余额查询失败'
    return (
      <span className={styles.balance} title="账户余额">
        <Wallet size={12} />
        余额 {text}
        {canRecharge(wallet.data) ? (
          <button type="button" className={styles.link} onClick={() => openRecharge(wallet.data)}>
            充值
          </button>
        ) : null}
      </span>
    )
  }

  return (
    <div className={styles.account} data-account-menu="">
      <div className={styles.avatar} aria-hidden="true">{name.slice(0, 1)}</div>
      <div className={styles.text}>
        <strong title={account.user.email ?? name}>{name}</strong>
        {balance()}
      </div>
      <button type="button" className={styles.logout} onClick={logout} title="退出登录" aria-label="退出登录">
        <LogOut size={16} />
      </button>
    </div>
  )
}
