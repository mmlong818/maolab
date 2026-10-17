/**
 * 把迁入的课程服务绑定到一个 owner 的仓储（3a）。
 *
 * 同一实例内按课程串行靠内存队列（宿主按 owner 缓存、复用同一个返回值）。跨实例、跨进程的写者（3b 渲染 worker、
 * 3c 工具、3d 接口）靠 CAS：会话、逐页生成、渲染的持久化都按本次读到的版本 saveMainlineCourseIfUnchanged，
 * 冲突抛 MainlineCourseWriteConflictError（不覆盖别人的写入）；单页正文与截图证据的合并会重读后有限次重放（3a 终审）。
 * 模型与图像不在这里配置：调用方在 runWithCourseRuntime 里调用 pages.runNext / audit.run。
 * 截图采集与证据落盘由 3b 的 worker 注入（options.render），渲染页地址也由它注入；没给就没有 render。
 */
import { createGenerationCourseAuditor, defaultCourseAuditFacts, type GenerationCourseAuditDependencies } from '../mainline/generation-course-audit.js'
import { createGenerationPageRunner, defaultGenerationPageRunnerDependencies, type GenerationPageRunnerDependencies } from '../mainline/generation-page-runner.js'
import { createGenerationRenderRunner, type GenerationRenderDependencies } from '../mainline/generation-render-runner.js'
import { createGenerationSessionService, type GenerationSessionService } from '../mainline/generation-session-service.js'
import type { MainlineCourse } from '../mainline/domain.js'
import { MainlineCourseWriteConflictError, type MainlineCourseStore } from '../mainline/store.js'
import { createTeacherAcceptanceService } from '../mainline/teacher-acceptance.js'

export interface CourseGenerationOptions {
  pages?: Partial<Omit<GenerationPageRunnerDependencies, 'persistence'>>
  auditFacts?: GenerationCourseAuditDependencies['auditFacts']
  render?: Pick<GenerationRenderDependencies, 'capture' | 'writeEvidence' | 'pageUrl'>
}

export interface CourseGenerationServices {
  session: GenerationSessionService
  pages: ReturnType<typeof createGenerationPageRunner>
  audit: ReturnType<typeof createGenerationCourseAuditor>
  acceptance: ReturnType<typeof createTeacherAcceptanceService>
  render: ReturnType<typeof createGenerationRenderRunner> | undefined
}

/**
 * 迁入 runner 的 find/save 持久化，改成 CAS：find 记下读到的版本，save 只在版本未变时写，写完即作废该版本
 * （再写必须先重读）。每个 runner 各用一份：runner 内同一课程的操作已经串行，版本表不会被同实例的并发操作串用。
 */
export function createCasCoursePersistence(store: MainlineCourseStore) {
  const versions = new Map<string, number>()
  return {
    async find(courseId: string): Promise<MainlineCourse | undefined> {
      const snapshot = await store.findMainlineCourseSnapshot(courseId)
      if (snapshot) versions.set(courseId, snapshot.updatedAt)
      else versions.delete(courseId)
      return snapshot?.course
    },
    async save(course: MainlineCourse): Promise<void> {
      const expected = versions.get(course.id)
      versions.delete(course.id)
      if (expected === undefined) {
        throw new MainlineCourseWriteConflictError(course.id, `课程 ${course.id} 写入冲突：保存前没有读到版本，拒绝无条件覆盖。`)
      }
      if (!(await store.saveMainlineCourseIfUnchanged(course, expected))) {
        throw new MainlineCourseWriteConflictError(course.id, `课程 ${course.id} 写入冲突：读取（版本 ${expected}）后已被其他写入更新，本次结果未写入。`)
      }
    },
  }
}

export function createCourseGenerationServices(store: MainlineCourseStore, options: CourseGenerationOptions = {}): CourseGenerationServices {
  const snapshots = { findSnapshot: store.findMainlineCourseSnapshot, saveIfUnchanged: store.saveMainlineCourseIfUnchanged }
  const session = createGenerationSessionService(createCasCoursePersistence(store))
  return {
    // 只读的 find 不经 CAS 持久化，免得在 execute 读写之间刷新它记下的版本
    session: { execute: session.execute, find: async (courseId) => (await store.findMainlineCourse(courseId))?.generationSession },
    pages: createGenerationPageRunner({ persistence: createCasCoursePersistence(store), ...defaultGenerationPageRunnerDependencies(), ...options.pages }),
    audit: createGenerationCourseAuditor({ ...snapshots, auditFacts: options.auditFacts ?? defaultCourseAuditFacts }),
    acceptance: createTeacherAcceptanceService(snapshots),
    render: options.render
      ? createGenerationRenderRunner({ ...createCasCoursePersistence(store), ...options.render })
      : undefined,
  }
}
