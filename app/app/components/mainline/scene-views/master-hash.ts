import type { LessonScene, MainlineCourse } from '../../../lib/mainline/domain.js'

/**
 * master-hash · pickMaster 的纯逻辑实现(从 shared.tsx 抽出,2026-07-21)
 *
 * 抽出原因:只用 type-only 依赖(无 '@/lib/mainline' 值导入),
 * 使 ai-master-select.ts 可以被 __tests__/*.test.ts 直接引入而不牵连
 * shared.tsx 里一堆需要 Next.js 路径别名解析的组件级 import
 * (vitest 未配 tsconfig-paths,'@/' 别名在测试环境下不可解析)。
 * shared.tsx 原样 re-export pickMaster,五个既有调用点(practice/recap/
 * concept-build/source-reading/worked-example)零改动。
 */

function hashOf(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return h
}

/**
 * 构图母版选择器:每幕型 N 个结构真异质母版,按 (course.id + scene.id + salt) 哈希
 * 确定性选择——同课稳定不跳,跨课错开(不同课程的同一幕型不再撞同一张构图)。
 */
export function pickMaster(course: MainlineCourse, scene: LessonScene, salt: string, count: number): number {
  return hashOf(`${course.id}::${scene.id}::${salt}`) % count
}
