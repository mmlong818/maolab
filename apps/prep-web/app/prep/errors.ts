// 面板与对话共用的错误文案：api 的 PrepApiError 直接用它的中文 error；请求编号冲突（对话、截图与导出统一为 REQUEST_KEY_CONFLICT，
// 终审修复统一）换成老师看得懂的说法；其余异常（断网等）用调用方给的兜底文案。
import { PrepApiError } from './lib/api'

export const REQUEST_CONFLICT_CODE = 'REQUEST_KEY_CONFLICT'
export const REQUEST_CONFLICT_TEXT = '这次操作和之前的一次请求撞了编号，没有执行。请再点一次（或重新发送）。'

export const isRequestConflict = (e: unknown): boolean => e instanceof PrepApiError && e.status === 409 && e.code === REQUEST_CONFLICT_CODE

export function errorText(e: unknown, fallback: string): string {
  if (isRequestConflict(e)) return REQUEST_CONFLICT_TEXT
  return e instanceof PrepApiError ? e.message : fallback
}
