# 备课室前端镜像：Next 静态导出 + Nginx。构建上下文为仓库根目录（pnpm 工作区）。
# 运行时环境变量：API_UPSTREAM（prep-api 地址，默认 http://prep-api:8080）。容器端口 8080。
ARG NODE_IMAGE=node:22-slim
ARG NGINX_IMAGE=nginx:1.27-alpine

FROM ${NODE_IMAGE} AS build
ARG NPM_REGISTRY=https://registry.npmjs.org
ARG PNPM_VERSION=11.18.0
ENV npm_config_registry=${NPM_REGISTRY} \
    NEXT_TELEMETRY_DISABLED=1 \
    CI=1
RUN npm install -g "pnpm@${PNPM_VERSION}" && pnpm --version
WORKDIR /src
# 前端不用 maolab-core，但 pnpm 按 lockfile 安装时仍要读 file: 依赖的目录，所以同样传入具名上下文 core（只在构建阶段）
COPY --from=core packages /maolab-core/packages
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/prep-web/package.json apps/prep-web/
COPY packages/ packages/
RUN pnpm install --frozen-lockfile --ignore-scripts --registry="${NPM_REGISTRY}" --filter @maolab/prep-web...
COPY apps/prep-web apps/prep-web
RUN cd apps/prep-web && pnpm exec next build

FROM ${NGINX_IMAGE}
ENV API_UPSTREAM=http://prep-api:8080 \
    NGINX_ENVSUBST_FILTER='^(API_UPSTREAM)$'
RUN rm -f /etc/nginx/conf.d/default.conf
COPY apps/prep-web/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /src/apps/prep-web/out/ /usr/share/nginx/html/
EXPOSE 8080
