# 渲染 worker（3b，第五个镜像）：Node + playwright-core + Debian 的 chromium + 中文字体。构建上下文为仓库根目录。
#   docker compose build render
# 国内网络示例：NODE_IMAGE=docker.m.daocloud.io/node:22-slim APT_MIRROR=mirrors.aliyun.com NPM_REGISTRY=https://registry.npmmirror.com
# 浏览器不走 Playwright 的下载（国内 CDN 不稳），用发行版的 chromium 包；版本兼容与沙箱见计划"已定事实·浏览器"的后备。
# 运行时环境变量：RENDER_PG_URL（postgresql:// 形式）、RENDER_PAGE_ORIGIN（frontend 的内网地址）、RENDER_CHROMIUM_NO_SANDBOX（容器内通常为 1）。
ARG NODE_IMAGE=node:22-slim

FROM ${NODE_IMAGE} AS build
ARG NPM_REGISTRY=https://registry.npmjs.org
ARG PNPM_VERSION=11.18.0
ENV npm_config_registry=${NPM_REGISTRY} CI=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm install -g "pnpm@${PNPM_VERSION}"
WORKDIR /src
# maolab-core（私有仓库）以具名构建上下文 core 传入（compose 的 additional_contexts，或 docker build --build-context core=<core 目录>）；
# 各包的 file: 依赖写的是 ../../../maolab-core，WORKDIR 为 /src 时即 /maolab-core。core 的 dist 已提交，不在镜像里编译
COPY --from=core packages /maolab-core/packages
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY workers/render/package.json workers/render/
COPY packages/ packages/
# --ignore-scripts：同 api/harness 镜像，不编译工作区里无关的原生依赖（better-sqlite3 等）
RUN pnpm install --frozen-lockfile --ignore-scripts --registry="${NPM_REGISTRY}" --filter @maolab/render-worker...
COPY workers/render workers/render
RUN pnpm --filter @maolab/render-worker typecheck

FROM ${NODE_IMAGE}
ARG APT_MIRROR=
ARG HTTP_PROXY
ARG HTTPS_PROXY
RUN if [ -n "$APT_MIRROR" ]; then sed -i "s#deb.debian.org#${APT_MIRROR}#g" /etc/apt/sources.list.d/debian.sources; fi \
 && apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-noto-cjk fonts-noto-color-emoji curl tini \
 && rm -rf /var/lib/apt/lists/*
# WebRTC 加固（3b T7/N5）：页面脚本不得经 WebRTC 泄露本机 IP 或访问 STUN；只影响网络，不影响字体与排版。
# Debian 的 /usr/bin/chromium 是包装脚本，会加载 /etc/chromium.d/*；本机直接用 Edge/Chrome 时无此参数（开发环境不渲染不可信内容）
RUN printf '%s\n' 'export CHROMIUM_FLAGS="$CHROMIUM_FLAGS --force-webrtc-ip-handling-policy=disable_non_proxied_udp --webrtc-ip-handling-policy=disable_non_proxied_udp"' > /etc/chromium.d/webrtc-hardening
WORKDIR /src
COPY --from=build /maolab-core /maolab-core
COPY --from=build /src /src
RUN useradd --create-home --uid 10001 app
USER app
ENV NODE_ENV=production RENDER_BROWSER_PATH=/usr/bin/chromium RENDER_HEALTH_PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD curl -fsS http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["tini", "--"]
CMD ["./workers/render/node_modules/.bin/tsx", "workers/render/src/main.ts"]
