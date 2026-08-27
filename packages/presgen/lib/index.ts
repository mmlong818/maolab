export * from './types.js'
export * from './themes.js'
export { LAYOUTS } from './layouts/registry.js'
export * from './adapt-from-maolab.js'
export * from './adapt-from-mainline.js'
// ⚠️ render-pptx.ts 依赖 pptxgenjs(Node 侧重型库),故意不进本 barrel —— 避免
// 被任何未来的 client 组件间接打进浏览器包。请直接
// import { renderMainlinePptx } from '@maolab/presgen/render-pptx'。
