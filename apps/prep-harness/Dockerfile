# 备课室 dsh 宿主：node:http 控制网关 + dsh 运行时 + prep-bundle。构建上下文为仓库根目录（镜像构建待 maolab-core 改成 git tag 依赖后可用，见 docs/ISSUES.md）。
ARG NODE_IMAGE=node:24-slim
FROM ${NODE_IMAGE} AS build
ARG NPM_REGISTRY=https://registry.npmjs.org
ARG PNPM_VERSION=11.18.0
ENV npm_config_registry=${NPM_REGISTRY} CI=1
RUN npm install -g "pnpm@${PNPM_VERSION}"
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/prep-harness/package.json apps/prep-harness/
COPY packages/ packages/
# --ignore-scripts：同 api 镜像，不编译工作区里无关的原生依赖
RUN pnpm install --frozen-lockfile --ignore-scripts --registry="${NPM_REGISTRY}" --filter @maolab/prep-harness...
COPY apps/prep-harness apps/prep-harness
# profile 目录位于根工作区之下，根 install 不会为它建 node_modules；
# 必须单独 --ignore-workspace 安装，宿主才能解析 @maolab/prep-harness/gateway
RUN cd apps/prep-harness/.dsh-home/profiles/maolab-prep-host && pnpm install --ignore-workspace --ignore-scripts --registry="${NPM_REGISTRY}"
RUN pnpm --filter @maolab/prep-harness typecheck

FROM ${NODE_IMAGE}
RUN apt-get update && apt-get install -y --no-install-recommends curl tini && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY --from=build /src /src
ENV NODE_ENV=production \
    DSH_HOME=/src/apps/prep-harness/.dsh-home \
    YUNYI_GATEWAY_HOST=0.0.0.0 \
    YUNYI_GATEWAY_PORT=8080 \
    YUNYI_SESSIONS_ROOT=/tmp/maolab-prep-sessions \
    NODE_OPTIONS=--experimental-strip-types
WORKDIR /src/apps/prep-harness
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -fsS http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["tini", "--"]
CMD ["node", "node_modules/@deepseek-ai/dsh/lib/bin.js", "--profile", "maolab-prep-host"]
