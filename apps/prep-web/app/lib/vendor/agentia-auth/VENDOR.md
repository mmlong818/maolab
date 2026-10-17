# @agentia/auth-browser（vendored 构建产物）

来源：dual-login-sdk `http://172.24.140.52:7080/ai_employee/dual-login-sdk`
commit：`77fc7af0d9428b44c9372bedb2c497f5a20324c2`，浏览器包 0.2.0

产物：`packages/browser/dist/agentia-auth-browser.esm-browser.js`（可读版 ESM，
由 `tsc -p tsconfig.json && vite build` 生成；压缩交给 studio 自己的 Vite）
+ `dist/types/*.d.ts`。`agentia-auth-browser.esm-browser.d.ts` 是本仓库加的类型入口。

**不要改这里的代码。** 升级：在 SDK 仓库重新构建后整体覆盖并更新 commit。
宿主侧接线：`src/auth/authClient.ts`、`src/auth/useAuth.tsx`。

## 本项目（maolab）

2026-09-29 从 byte-bite（`D:\code\byte-bite`，提交 `79504e7f`）的 `studio/src/vendor/agentia-auth` 原样复制，未修改。
宿主侧接线：`app/lib/auth/client.ts`、`app/lib/auth/wallet.ts`、`app/components/AuthGate.tsx`。
