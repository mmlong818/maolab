'use client'

/**
 * useWorkbenchActions · 备课工作台的四个逐页编辑动作(v5 M1 WP2 接线 WP1 端点)
 *
 * PATCH(改讲稿)是唯一做本地乐观更新的动作——响应体不含改后的完整 scene,
 * 但请求体本身就是改动后的字段值,可以直接拿它更新本地 course/prepBrief,
 * 不必整页刷新,交互最跟手。
 *
 * regen/delete/reskeleton 三个都会改变 scenes/learningFragments/beats 的结构或内容,
 * 响应体只回落 qualityStatus/summary/issues,不足以在本地重建完整课程——同
 * FillBanner 的既有约定,成功后整页刷新(`window.location.reload()`)拿服务端
 * 重新渲染的最新数据,不在前端重新实现一份编译逻辑。
 */
import { useState } from 'react'
import type { KnowledgeType } from '@maolab/shared-types'
import type { Executor, FactAuditRecord, MainlineCourse, QualityIssue, QualitySummary, SceneType, VoiceCue } from '@/lib/mainline'
import type { PrepBrief, PrepBriefMisconception } from '@/lib/mainline/prep-brief'

export interface ScenePatchInput {
  contentSlots?: Record<string, string>
  visualFocus?: string
  narrationAnchor?: string
  boardText?: string[]
  teacherScript?: string
  studentAction?: string
  evidenceOnScreen?: string[]
  misconceptionSources?: string[]
  voiceCue?: VoiceCue
  /** v5 M2:教师调整本幕人机分工,同走逐页 PATCH 白名单。 */
  executor?: Executor
}

export type WorkbenchBusy =
  | { kind: 'patch'; sceneId: string }
  | { kind: 'regen'; sceneId: string }
  | { kind: 'fact-audit'; sceneId: string }
  | { kind: 'image-redraw'; sceneId: string }
  | { kind: 'delete'; sceneId: string }
  | { kind: 'reskeleton'; fragmentId: string }
  /** v5 M2 插页:sceneId 是插入位置的 anchor 幕(插在它之后),与其它 kind 的 sceneId 语义对齐。 */
  | { kind: 'insert'; sceneId: string }
  /** 模板替换(2026-07-22):课程级换皮,无 sceneId。 */
  | { kind: 'style' }
  /** 存量课程角色翻新:按当前学段与学科重建老师、同学和声线。 */
  | { kind: 'cast-refresh' }
  /** 存量课程交互契约翻新:只同步当前页面真实支持的操作说明。 */
  | { kind: 'runtime-contract-refresh' }
  /** 存量课程教材依据翻新:只同步知识点索引中的来源定位。 */
  | { kind: 'source-grounding-refresh' }
  /** 存量课程目标追溯迁移:保留整课目标，新增并绑定逐知识点目标。 */
  | { kind: 'kp-goal-refresh' }
  /** 存量课程误区校准:只纠正已绑定教材原文但发生漂移的错误说法。 */
  | { kind: 'misconception-refresh' }
  /** 存量学习活动深化:开场预测、例题自解释、收束迁移与可见回答。 */
  | { kind: 'learning-activity-refresh' }
  /** 存量问题练习重写:整批通过后才保存。 */
  | { kind: 'practice-refresh' }
  | null

interface UseWorkbenchActionsArgs {
  courseId: string
  initialCourse: MainlineCourse
  initialIssues: QualityIssue[]
  initialSummary: QualitySummary
  initialPrepBrief?: PrepBrief
}

async function readJson(res: Response): Promise<{ error?: string; [key: string]: unknown }> {
  try {
    return await res.json()
  } catch {
    return {}
  }
}

export function useWorkbenchActions({
  courseId,
  initialCourse,
  initialIssues,
  initialSummary,
  initialPrepBrief,
}: UseWorkbenchActionsArgs) {
  const [course, setCourse] = useState(initialCourse)
  const [issues, setIssues] = useState(initialIssues)
  const [summary, setSummary] = useState(initialSummary)
  const [prepBrief, setPrepBrief] = useState(initialPrepBrief)
  const [busy, setBusy] = useState<WorkbenchBusy>(null)
  const [error, setError] = useState<string | null>(null)

  async function patchScene(sceneId: string, patch: ScenePatchInput): Promise<boolean> {
    setBusy({ kind: 'patch', sceneId })
    setError(null)
    try {
      const res = await fetch(`/api/v2/mainline/scene/${courseId}/${sceneId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const body = await readJson(res)
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${res.status}`)

      const nextQualityStatus = body.qualityStatus as MainlineCourse['qualityStatus']
      const nextSummary = body.summary as QualitySummary
      const nextIssues = body.issues as QualityIssue[]
      const nextFactAudit = body.factAudit as FactAuditRecord | undefined
      const targetScene = course.scenes.find(scene => scene.id === sceneId)
      const sourcePatch = patch.misconceptionSources
        ? {
            misconceptionSource: patch.misconceptionSources[0]!,
            misconceptionSources: patch.misconceptionSources,
          }
        : {}

      setCourse(prev => ({
        ...prev,
        qualityStatus: nextQualityStatus,
        ...(nextFactAudit ? { factAudit: nextFactAudit } : {}),
        scenes: prev.scenes.map(s => (s.id === sceneId ? { ...s, ...patch, ...sourcePatch, editedByTeacher: true } : s)),
      }))
      setIssues(nextIssues)
      setSummary(nextSummary)
      setPrepBrief(prev => {
        if (!prev) return prev
        const nextBrief: PrepBrief = {
          ...prev,
          qualityStatus: nextQualityStatus,
          qualitySummary: { ...nextSummary, source: '质量闸门' as const },
          kps: targetScene?.kpId && patch.misconceptionSources
            ? prev.kps.map(entry => entry.kpId === targetScene.kpId
              ? {
                  ...entry,
                  misconceptions: entry.misconceptions.map(item => reconcileMisconceptionAddress(
                    item,
                    sceneId,
                    patch.misconceptionSources!,
                  )),
                }
              : entry)
            : prev.kps,
        }
        if (!nextFactAudit) return nextBrief
        return {
          ...nextBrief,
          factAudit: {
            ...prev.factAudit,
            available: true,
            auditedSceneCount: nextFactAudit.auditedSceneCount,
            pendingSceneCount: nextFactAudit.pendingSceneIds?.length ?? 0,
            fatalCount: nextFactAudit.fatalCount,
            byScene: nextFactAudit.pendingSceneIds?.includes(sceneId) && targetScene
              ? [
                  ...prev.factAudit.byScene.filter(entry => entry.sceneId !== sceneId),
                  {
                    sceneId,
                    sceneType: targetScene.sceneType,
                    ...(targetScene.kpId ? { kpId: targetScene.kpId } : {}),
                    fatalCount: 0,
                    misleadingCount: 0,
                    impreciseCount: 0,
                    unverified: false,
                    pendingReview: true,
                    details: [{
                      severity: 'info' as const,
                      message: '教师修改后尚未重新进行事实核查。',
                      impact: '本页的新断言可能尚未经过教材事实核验。',
                      fix: '打开本页并点击“核查本页”，通过后再开始上课。',
                    }],
                  },
                ]
              : prev.factAudit.byScene,
          },
        }
      })
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return false
    } finally {
      setBusy(null)
    }
  }

  async function regenerateScene(sceneId: string): Promise<void> {
    setBusy({ kind: 'regen', sceneId })
    setError(null)
    try {
      const res = await fetch(`/api/v2/mainline/scene/${courseId}/${sceneId}/regen`, { method: 'POST' })
      const body = await readJson(res)
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${res.status}`)
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(null)
    }
  }

  async function auditSceneFacts(sceneId: string): Promise<void> {
    setBusy({ kind: 'fact-audit', sceneId })
    setError(null)
    try {
      const res = await fetch(`/api/v2/mainline/scene/${courseId}/${sceneId}/audit`, { method: 'POST' })
      const body = await readJson(res)
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${res.status}`)
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(null)
    }
  }

  async function redrawSceneImage(sceneId: string): Promise<void> {
    setBusy({ kind: 'image-redraw', sceneId })
    setError(null)
    try {
      const res = await fetch(`/api/v2/mainline/image/${courseId}/${sceneId}/redraw`, { method: 'POST' })
      const body = await readJson(res)
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${res.status}`)
      if (typeof body.imageUrl !== 'string') throw new Error('图片服务没有返回新图片。')

      setCourse(prev => ({
        ...prev,
        scenes: prev.scenes.map(scene => scene.id === sceneId
          ? {
              ...scene,
              imageUrl: body.imageUrl as string,
              ...(typeof body.imagePrompt === 'string' ? { imagePrompt: body.imagePrompt } : {}),
              ...(typeof body.imageFidelity === 'string' ? { imageFidelity: body.imageFidelity as typeof scene.imageFidelity } : {}),
              ...(typeof body.imageAspect === 'string' ? { imageAspect: body.imageAspect } : {}),
            }
          : scene),
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function deleteScene(sceneId: string): Promise<void> {
    setBusy({ kind: 'delete', sceneId })
    setError(null)
    try {
      const res = await fetch(`/api/v2/mainline/scene/${courseId}/${sceneId}`, { method: 'DELETE' })
      const body = await readJson(res)
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${res.status}`)
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(null)
    }
  }

  async function reskeletonFragment(fragmentId: string, knowledgeType: KnowledgeType): Promise<void> {
    setBusy({ kind: 'reskeleton', fragmentId })
    setError(null)
    try {
      const res = await fetch(`/api/v2/mainline/fragment/${courseId}/${fragmentId}/reskeleton`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ knowledgeType }),
      })
      const body = await readJson(res)
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${res.status}`)
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(null)
    }
  }

  /** v5 M2 插页:在 afterSceneId 之后插入一幕新的 sceneType(目前只开放 ai-collab)。 */
  async function insertScene(afterSceneId: string, sceneType: SceneType): Promise<void> {
    setBusy({ kind: 'insert', sceneId: afterSceneId })
    setError(null)
    try {
      const res = await fetch(`/api/v2/mainline/scene/${courseId}/insert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ afterSceneId, sceneType }),
      })
      const body = await readJson(res)
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${res.status}`)
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(null)
    }
  }

  /** 模板替换:课程级换皮(纯呈现层字段)。响应不含课程体,但字段值就是请求值,
   * 本地直接更新 course——中栏预览台同吃这份 state,换皮即时可见,不整页刷新。 */
  async function setStylePack(stylePackId: string | null): Promise<void> {
    setBusy({ kind: 'style' })
    setError(null)
    try {
      const res = await fetch(`/api/v2/mainline/style/${courseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stylePackId }),
      })
      const body = await readJson(res)
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${res.status}`)
      setCourse(prev => {
        const { stylePackId: _dropped, ...rest } = prev
        return stylePackId === null ? (rest as MainlineCourse) : { ...rest, stylePackId }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function refreshCast(): Promise<void> {
    setBusy({ kind: 'cast-refresh' })
    setError(null)
    try {
      const res = await fetch(`/api/v2/mainline/refresh-cast/${courseId}`, { method: 'POST' })
      const body = await readJson(res)
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${res.status}`)
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(null)
    }
  }

  async function refreshRuntimeContracts(): Promise<void> {
    setBusy({ kind: 'runtime-contract-refresh' })
    setError(null)
    try {
      const res = await fetch(`/api/v2/mainline/refresh-runtime-contract/${courseId}`, { method: 'POST' })
      const body = await readJson(res)
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${res.status}`)
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(null)
    }
  }

  async function refreshSourceGroundings(): Promise<void> {
    setBusy({ kind: 'source-grounding-refresh' })
    setError(null)
    try {
      const res = await fetch(`/api/v2/mainline/refresh-source-grounding/${courseId}`, { method: 'POST' })
      const body = await readJson(res)
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${res.status}`)
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(null)
    }
  }

  async function refreshKpGoals(): Promise<void> {
    setBusy({ kind: 'kp-goal-refresh' })
    setError(null)
    try {
      const res = await fetch(`/api/v2/mainline/refresh-kp-goals/${courseId}`, { method: 'POST' })
      const body = await readJson(res)
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${res.status}`)
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(null)
    }
  }

  async function refreshMisconceptionClaims(): Promise<void> {
    setBusy({ kind: 'misconception-refresh' })
    setError(null)
    try {
      const res = await fetch(`/api/v2/mainline/refresh-misconceptions/${courseId}`, { method: 'POST' })
      const body = await readJson(res)
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${res.status}`)
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(null)
    }
  }

  async function refreshProblemPractices(): Promise<void> {
    setBusy({ kind: 'practice-refresh' })
    setError(null)
    try {
      const res = await fetch(`/api/v2/mainline/refresh-practices/${courseId}`, { method: 'POST' })
      const body = await readJson(res)
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${res.status}`)
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(null)
    }
  }

  async function refreshLearningActivities(): Promise<void> {
    setBusy({ kind: 'learning-activity-refresh' })
    setError(null)
    try {
      const res = await fetch(`/api/v2/mainline/refresh-learning-activities/${courseId}`, { method: 'POST' })
      const body = await readJson(res)
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${res.status}`)
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(null)
    }
  }

  return {
    course,
    issues,
    summary,
    prepBrief,
    busy,
    error,
    clearError: () => setError(null),
    patchScene,
    auditSceneFacts,
    regenerateScene,
    redrawSceneImage,
    deleteScene,
    reskeletonFragment,
    insertScene,
    setStylePack,
    refreshCast,
    refreshRuntimeContracts,
    refreshSourceGroundings,
    refreshKpGoals,
    refreshMisconceptionClaims,
    refreshLearningActivities,
    refreshProblemPractices,
  }
}

function reconcileMisconceptionAddress(
  item: PrepBriefMisconception,
  sceneId: string,
  selectedSources: readonly string[],
): PrepBriefMisconception {
  if (selectedSources.includes(item.text)) {
    return { ...item, addressed: true, addressedInSceneId: sceneId }
  }
  if (item.addressedInSceneId !== sceneId) return item
  const { addressedInSceneId: _removed, ...rest } = item
  return { ...rest, addressed: false }
}
