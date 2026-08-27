import type { NextConfig } from 'next'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'

const sharedConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3', 'ws'],
  experimental: {
    extensionAlias: {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    },
  },
  transpilePackages: [
    '@maolab/shared-types',
    '@maolab/db',
    '@maolab/user-profile',
    '@maolab/setup',
    '@maolab/generator',
    '@maolab/classroom',
  ],
  webpack(config, { isServer }) {
    if (isServer) {
      const existing = Array.isArray(config.externals) ? config.externals : []
      config.externals = [
        ...existing,
        { 'better-sqlite3': 'commonjs better-sqlite3' },
        { 'ws': 'commonjs ws' },
      ]
    }
    return config
  },
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}

export default function nextConfig(phase: string): NextConfig {
  return {
    ...sharedConfig,
    // `next dev` 与 `next build` 同时写 `.next` 会让正在运行的深层路由引用
    // 已被构建过程替换的 vendor chunk。开发缓存独立后，生产验收不再打断备课服务。
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
  }
}
