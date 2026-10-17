// 余额的进程内单例（移植自 byte-bite studio/src/auth/wallet.ts，去掉绑定密钥）：账号菜单与额度提示共读一份。
// /api/auth/wallet 每次都真查上游网关，不是免费的，所以按节奏刷新而不是各处轮询。
// 通道无关：云一给 balanceCny + recharge.mode=redirect（跳网关钱包页）；AI 员工平台给 credits/coin + recharge.mode=inline（SDK 站内弹窗）。
import { useEffect, useSyncExternalStore } from 'react'

import type { WalletData } from '../vendor/agentia-auth/agentia-auth-browser.esm-browser.js'
import { authClient } from './client'

export type WalletStatus = 'idle' | 'loading' | 'ok' | 'error'

export interface WalletSnapshot {
  status: WalletStatus
  data: WalletData | null
}

// 刷新节奏：静置 3 分钟一次、切回前台至多 20 秒一次、一轮对话结束后 1.5 秒合并且距上次至少 10 秒
const LIVE_INTERVAL_MS = 180_000
const FOCUS_MIN_GAP_MS = 20_000
const SPEND_DEBOUNCE_MS = 1_500
const SPEND_MIN_GAP_MS = 10_000

let snap: WalletSnapshot = { status: 'idle', data: null }
const listeners = new Set<() => void>()
let inflight: Promise<void> | null = null
let lastFetchAt = 0
let spendTimer: ReturnType<typeof setTimeout> | null = null
let liveTimer: ReturnType<typeof setInterval> | null = null
let users = 0

function set(next: Partial<WalletSnapshot>) {
  snap = { ...snap, ...next }
  for (const listener of listeners) listener()
}

/** 重查余额（并发合并）。非 200 归一成 null、服务端查失败给 unavailable——都不能当「余额 0」显示。 */
export function refreshWallet(): Promise<void> {
  if (inflight) return inflight
  set({ status: 'loading' })
  inflight = (async () => {
    try {
      const data = await authClient().getWallet()
      lastFetchAt = Date.now()
      set({ status: !data || data.unavailable ? 'error' : 'ok', data })
    } catch {
      set({ status: 'error' })
    } finally {
      inflight = null
    }
  })()
  return inflight
}

/** 刚花了钱（一轮对话结束）：合并后重查一次。 */
export function notifyWalletSpend(): void {
  if (users === 0 || spendTimer) return
  const wait = Math.max(SPEND_DEBOUNCE_MS, lastFetchAt + SPEND_MIN_GAP_MS - Date.now())
  spendTimer = setTimeout(() => {
    spendTimer = null
    void refreshWallet()
  }, wait)
}

function onVisible() {
  if (document.visibilityState !== 'visible') return
  // 充值在新标签页完成，切回来要立刻看到到账；但频繁切窗不该每次都打网关
  if (Date.now() - lastFetchAt >= FOCUS_MIN_GAP_MS) void refreshWallet()
}

function start() {
  void refreshWallet()
  liveTimer = setInterval(() => {
    if (document.visibilityState === 'visible') void refreshWallet()
  }, LIVE_INTERVAL_MS)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onVisible)
}

function stop() {
  if (liveTimer) clearInterval(liveTimer)
  liveTimer = null
  if (spendTimer) clearTimeout(spendTimer)
  spendTimer = null
  document.removeEventListener('visibilitychange', onVisible)
  window.removeEventListener('focus', onVisible)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const serverSnapshot: WalletSnapshot = { status: 'idle', data: null }

/** 订阅余额；首个使用者挂上时启动刷新节奏，最后一个卸载时停掉。active=false 不计为使用者，不发请求。 */
export function useWallet(active = true): WalletSnapshot {
  useEffect(() => {
    if (!active) return
    if (users++ === 0) start()
    return () => {
      if (--users === 0) stop()
    }
  }, [active])
  return useSyncExternalStore(subscribe, () => snap, () => serverSnapshot)
}

/** 通道是否启用余额（enabled:false = 本站 token 不带上游凭证 / 通道未配，不显示余额与充值） */
export function walletEnabled(data: WalletData | null): boolean {
  return data?.enabled !== false
}

/** 能否充值：站内弹窗（平台）或外链钱包页（云一）二者有其一 */
export function canRecharge(data: WalletData | null): boolean {
  const recharge = data?.recharge
  if (!recharge) return false
  return recharge.mode === 'inline' ? true : Boolean(recharge.walletUrl)
}

/** 打开充值：inline 走 SDK 站内弹窗；redirect 新开标签到钱包页，切回本页时自动重查余额。 */
export function openRecharge(data: WalletData | null): void {
  const recharge = data?.recharge
  if (!recharge) return
  if (recharge.mode === 'inline') authClient().openRecharge(recharge, data)
  else if (recharge.walletUrl) window.open(recharge.walletUrl, '_blank', 'noopener')
}

/** 余额文本；null = 无可显示的数（调用方显示「查询失败」）。顺序同平台 SDK：展示币 → 积分 → 人民币。 */
export function formatBalance(data: WalletData, unlimitedText: string): string | null {
  if (data.unlimited) return unlimitedText
  const coin = data.coin
  // converted:false = 汇率没配，available 是积分原值，不能当展示币显示
  if (coin && typeof coin.available === 'number' && coin.converted !== false) return `${coin.available}`
  if (typeof data.credits === 'number') return `${data.credits} 积分`
  if (typeof data.balanceCny === 'number') return `¥ ${data.balanceCny.toFixed(2)}`
  return null
}
