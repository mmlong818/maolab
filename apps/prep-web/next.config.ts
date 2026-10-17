import type { NextConfig } from 'next'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'

// 备课室前端为静态导出（out/），由 Nginx 托管并把 /api 反代到 prep-api：见 Dockerfile 与 nginx/。
// 本地开发（next dev）不导出：/api 一律转发到 prep-api（PREP_API_PROXY，默认 http://127.0.0.1:8101；渲染数据路径由 api 自己回 404）。
export default function nextConfig(phase: string): NextConfig {
  const base: NextConfig = {
    trailingSlash: true,
    images: { unoptimized: true },
    productionBrowserSourceMaps: false,
    // 投影舞台与渲染约定在 packages/course，以 .ts 源码发布，由 Next 编译
    transpilePackages: ['@maolab/course'],
    experimental: {
      extensionAlias: {
        '.js': ['.ts', '.tsx', '.js', '.jsx'],
      },
    },
  }
  if (phase !== PHASE_DEVELOPMENT_SERVER) return { ...base, output: 'export' }
  const api = (process.env.PREP_API_PROXY?.trim() || 'http://127.0.0.1:8101').replace(/\/+$/, '')
  return {
    ...base,
    // trailingSlash 会先把 /api/xxx 重定向为 /api/xxx/，转发到后端前必须跳过；页面链接本身已带斜杠
    skipTrailingSlashRedirect: true,
    // rewrites 代理默认 30 秒超时：上游断开后不会通知浏览器，备课回合流会一直挂着；与 Nginx 的 proxy_read_timeout 对齐
    experimental: { ...base.experimental, proxyTimeout: 300_000 },
    async rewrites() {
      return { beforeFiles: [{ source: '/api/:path*', destination: `${api}/api/:path*` }], afterFiles: [], fallback: [] }
    },
  }
}
