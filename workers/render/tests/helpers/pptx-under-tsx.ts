// 在 worker 的真实运行时（tsx，见 package.json 的 start）里生成一份 PPTX，打印字节数。
// vitest 与 tsx 对 pptxgenjs 的默认导出解析不同（tsx 下默认导出是 { default: 构造函数 }），只在 vitest 里测会漏掉。
import { buildProjectionPptx } from '../../src/pptx.ts'
import { solidPng } from './png.ts'

const pptx = await buildProjectionPptx({ title: 'tsx', slides: [{ png: solidPng(32, 18), notes: '讲稿' }] })
process.stdout.write(String(pptx.length))
