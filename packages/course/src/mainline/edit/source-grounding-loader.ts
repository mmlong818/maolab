/** 按课程当前 KP 批量读取教材来源节点，再复用建课期同一解析器（3a：经知识点端口，不再直读 SQLite）。 */

import type { CourseKnowledgePort } from '../../ports.js'
import { resourceBundleLoader } from '../../services/errors.js'
import type { MainlineCourse } from '../domain.js'
import {
  resolveCourseGroundings,
  type CourseGroundingResult,
} from '../generation/course-grounding.js'

export async function resolveCurrentCourseGroundings(
  course: MainlineCourse,
  knowledge: CourseKnowledgePort,
  options: Parameters<typeof resolveCourseGroundings>[2] = {},
): Promise<CourseGroundingResult> {
  // 3a 终审：没给 loadBundle 时按"资源包未配置"降级，绝不回退到读文件系统/环境变量的 loadEducationResourceBundle
  const grounding = { ...options, loadBundle: options.loadBundle ?? resourceBundleLoader({}) }
  const kpsById = new Map<string, { id: string; canonicalName: string }>()
  for (const source of course.sourceMaterial) {
    if (source.kpId) kpsById.set(source.kpId, { id: source.kpId, canonicalName: source.title })
  }
  const kps = [...kpsById.values()]
  if (kps.length === 0) {
    return resolveCourseGroundings([], [], grounding)
  }

  const rows = await knowledge.knowledgePointSources(kps.map(kp => kp.id))
  return resolveCourseGroundings(kps, rows, grounding)
}
