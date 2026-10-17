import type { FastifyPluginAsync } from 'fastify'
import { authEnabled } from '../config.ts'

export const accountRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/account/me', async (req) => {
    const { config, store } = app.deps
    const userId = req.user_id!
    if (!authEnabled(config)) {
      return { enabled: false, user: { id: userId, displayName: null, email: null, channel: 'local', isAdmin: true }, billing: 'site' }
    }
    const user = await store.getUser(userId)
    const external = user?.external_id ?? ''
    const channel = external.startsWith('yy_') ? 'yunyi' : 'portal'
    // billing=user：云一用户且有凭证，按用户自己的额度计费
    const hasKey = channel === 'yunyi' && Boolean((await store.getCredential(userId)).apiKey)
    return {
      enabled: true,
      user: { id: userId, displayName: user?.display_name ?? null, email: user?.email ?? null, channel, isAdmin: config.adminUsers.has(userId) },
      billing: hasKey ? 'user' : 'site',
    }
  })
}
