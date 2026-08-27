import { redirect } from 'next/navigation'

/**
 * 旧线 v2 创作入口已停用。任何进入 `/create` 的请求 redirect 到 mainline 建课页。
 * 保留目录只为 TextbookPicker/KpTreeSelector 组件被 mainline/create 复用;组件不动。
 */
export default function LegacyCreateRedirect() {
  redirect('/mainline/create')
}
