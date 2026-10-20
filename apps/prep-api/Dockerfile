# 备课室 API：Fastify + 登录 SDK。构建上下文为仓库根目录。
ARG NODE_IMAGE=node:24-slim
FROM ${NODE_IMAGE} AS build
ARG NPM_REGISTRY=https://registry.npmjs.org
ARG PNPM_VERSION=11.18.0
ENV npm_config_registry=${NPM_REGISTRY} CI=1
RUN npm install -g "pnpm@${PNPM_VERSION}"
WORKDIR /src
# maolab-core（私有仓库）以具名构建上下文 core 传入（compose 的 additional_contexts，或 docker build --build-context core=<core 目录>）；
# 各包的 file: 依赖写的是 ../../../maolab-core，WORKDIR 为 /src 时即 /maolab-core。core 的 dist 已提交，不在镜像里编译
COPY --from=core packages /maolab-core/packages
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/prep-api/package.json apps/prep-api/
COPY packages/ packages/
# --ignore-scripts：esbuild 的安装脚本只做二进制优化，跳过不影响 tsx 运行
RUN pnpm install --frozen-lockfile --ignore-scripts --registry="${NPM_REGISTRY}" --filter @maolab/prep-api...
COPY apps/prep-api apps/prep-api
# 镜像里只有 src：测试与脚本会引用 apps/prep-harness 的测试 helper（不在镜像里），所以只检查 src（tsconfig.build.json）
RUN pnpm --filter @maolab/prep-api typecheck:build

FROM ${NODE_IMAGE}
RUN apt-get update && apt-get install -y --no-install-recommends curl tini && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY --from=build /maolab-core /maolab-core
COPY --from=build /src /src
ENV NODE_ENV=production API_PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -fsS http://127.0.0.1:8080/api/health || exit 1
ENTRYPOINT ["tini", "--"]
CMD ["./node_modules/.bin/tsx", "apps/prep-api/src/main.ts"]
