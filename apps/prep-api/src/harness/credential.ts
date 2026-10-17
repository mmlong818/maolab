// 备课用的云一凭证：只认老师本人的（yy_ 外部账号的上游 apiKey），没有就是 undefined——不回退任何站点密钥（用户裁决 D7）。
// status 的 hasCredential 与建会话、发消息前的判定共用这一个函数。
import type { PgCredentialStore } from '@maolab-core/auth'

export async function resolvePrepCredential(store: PgCredentialStore, userId: string): Promise<string | undefined> {
  const external = await store.getExternalId(userId).catch(() => null)
  if (external?.startsWith('yy_')) {
    const cred = await store.getCredential(userId).catch(() => ({}) as { apiKey?: string })
    if (cred.apiKey) return cred.apiKey
  }
  return undefined
}
