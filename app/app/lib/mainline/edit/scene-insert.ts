/**
 * scene-insert · v5 M2 插页(工作台手动添加,与 scene-delete 对称,WP8)
 *
 * ai-collab(AI 协作任务卡 + 评价量规)本包不自动进骨架(见 scene-techniques.ts
 * static-board 注释),专为教师手动插入预留——设计草案(tasks/m2-dual-teacher-
 * design-draft.md §2)：procedural 型 KP 且学段 ≥ 初中的课末可手动添加;这里不
 * 校验该条件,只提供插入能力本身,由教师在工作台自行判断插入时机。
 *
 * 结构约束(与 scene-delete.ts 同一批不变量的插入侧版本):
 * - 只能"插在某一幕之后"(afterSceneId),不能插在开场之前。
 * - 不能插在收束幕(recap)之后:recap 是全课唯一收束,必须保持最后一幕。
 * - anchor 幕必须属于某个 LearningFragment(compile-lesson 的固定不变量),新幕
 *   挂进同一片段的 sceneIds 尾部,不新建片段——避免"片段真空幕"打乱骨架依据展示。
 *
 * 内容槽留空占位(与 compile-lesson "待 LLM 填充" 同一约定,只是措辞改成"待教师
 * 编辑或重生成"——插入幕不经过 compile-lesson,是工作台的即时结构操作),等待
 * 教师手改或单页 regen(regen 走 fill-scenes 已注册的 ai-collab SCENE_ROLES)。
 */

import { randomUUID } from 'node:crypto'
import { auditMainlineCourse, blockingQualityIssues, type QualityIssue } from '../quality-gates.js'
import type { LessonScene, MainlineCourse, SceneType } from '../domain.js'
import { buildBeats } from '../generation/compile-lesson.js'
import { sceneTechniquesForSceneType } from '../scene-techniques.js'
import { hasPendingFactAudit } from './fact-audit-utils.js'

/** 目前只开放 ai-collab 手动插入(设计草案 §2);后续如需开放其它幕型,在此追加并在 buildPlaceholderScene 补分支。 */
export const INSERTABLE_SCENE_TYPES: readonly SceneType[] = ['ai-collab']
const AI_COLLAB_DURATION_SEC = 50

export interface InsertSceneResult {
  course: MainlineCourse
  /** 新插入幕的 id,供前端插入后直接选中/引导重生成。 */
  sceneId: string
  issues: QualityIssue[]
}

/** code 供路由层区分 HTTP 状态:not_found → 404,structural/unsupported → 400。 */
export type InsertSceneOutcome = InsertSceneResult | { error: string; code: 'not_found' | 'structural' | 'unsupported' }

export function insertSceneAfter(course: MainlineCourse, afterSceneId: string, sceneType: SceneType): InsertSceneOutcome {
  if (!INSERTABLE_SCENE_TYPES.includes(sceneType)) {
    return { error: `暂不支持手动插入「${sceneType}」幕;当前只开放:${INSERTABLE_SCENE_TYPES.join('、')}。`, code: 'unsupported' }
  }

  const afterIndex = course.scenes.findIndex(s => s.id === afterSceneId)
  if (afterIndex === -1) return { error: `scene not found: ${afterSceneId}`, code: 'not_found' }
  const afterScene = course.scenes[afterIndex]!

  if (afterScene.sceneType === 'recap') {
    return { error: '不能插在收束幕(recap)之后:它是全课唯一收束,必须保持最后一幕。', code: 'structural' }
  }

  const fragmentIndex = course.learningFragments.findIndex(f => f.sceneIds.includes(afterSceneId))
  if (fragmentIndex === -1) {
    return { error: `场景「${afterSceneId}」未挂在任何学习片段下,无法定位插入位置。`, code: 'structural' }
  }
  const fragment = course.learningFragments[fragmentIndex]!

  const newScene = buildPlaceholderScene(sceneType, afterScene, course.selectedTeacher)

  const scenes = [...course.scenes.slice(0, afterIndex + 1), newScene, ...course.scenes.slice(afterIndex + 1)]
  const posInFragment = fragment.sceneIds.indexOf(afterSceneId)
  const sceneIds = [...fragment.sceneIds.slice(0, posInFragment + 1), newScene.id, ...fragment.sceneIds.slice(posInFragment + 1)]
  const learningFragments = course.learningFragments.map((f, i) => (i === fragmentIndex
    ? { ...f, sceneIds, durationTargetSec: f.durationTargetSec + AI_COLLAB_DURATION_SEC }
    : f))
  const beats = buildBeats(scenes)

  // 与 patch/delete/regen 同款:审计用非 draft 副本——draft 会让内容槽闸门
  // (quality-gates pushSceneContentSlotIssues 对 draft 早退)整体静默,插入幕后算出的
  // passed 是被抑制的假状态(2026-08-26 code-review CONFIRMED:读取期就绪一复算就翻回 blocked)。
  const draftCourse: MainlineCourse = { ...course, scenes, learningFragments, beats }
  const issues = auditMainlineCourse(draftCourse)
  const blocking = blockingQualityIssues(issues)
  const fatalStillOpen = (course.factAudit?.fatalCount ?? 0) > 0
  const finalCourse: MainlineCourse = {
    ...draftCourse,
    qualityStatus: blocking.length === 0 && !fatalStillOpen && !hasPendingFactAudit(course.factAudit) ? 'passed' : 'blocked',
  }

  return { course: finalCourse, sceneId: newScene.id, issues }
}

/** 按 sceneType 生成一个结构合法的占位幕;内容槽留空待教师编辑或重生成。 */
function buildPlaceholderScene(sceneType: SceneType, afterScene: LessonScene, teacherCastId: string): LessonScene {
  const technique = sceneTechniquesForSceneType(sceneType)[0]
  if (!technique) {
    throw new Error(`insertSceneAfter: sceneType「${sceneType}」没有登记任何 SceneTechnique,无法生成合法占位幕。`)
  }

  const id = `ins-${randomUUID().slice(0, 8)}-${sceneType}`

  switch (sceneType) {
    case 'ai-collab':
      return {
        id,
        ...(afterScene.kpId ? { kpId: afterScene.kpId } : {}),
        sceneType: 'ai-collab',
        durationTargetSec: AI_COLLAB_DURATION_SEC,
        // 布置任务与展示评价标准是教师+AI 共同的落点,默认双师协作,教师可在工作台改分工。
        executor: 'co',
        visualLayout: 'central-task-card / narration-only',
        contentSlots: {
          task: '待 LLM 填充:一个用 AI 完成的小任务卡(教师编辑或重生成)',
          rubric: '待 LLM 填充:评价提示词质量与验证过程的量规(至少两条可观察维度)',
        },
        visualFocus: 'AI 协作任务与评价量规',
        narrationAnchor: '任务与量规',
        syncStrategy: '任务卡与量规卡上下排布,角色退场,只保留旁白字幕。',
        boardText: ['任务卡', '评价量规', '评的是过程不是答案'],
        sceneTechnique: technique.id,
        interactionContract: '学生课后或课间用 AI 完成任务卡,再对照量规自评提示词质量与验证过程。',
        fallbackPresentation: '任务卡与量规静态上下排布,不依赖任何角色和动效。',
        characterLayer: {
          layout: 'narration-only',
          positionRule: '任务卡与量规需要完整展示,角色退场,只保留旁白字幕。',
          exitRule: '进入下一页后按需切换版式。',
        },
        dialogueLayout: 'narration-only',
        peerFunction: 'none',
        subjectTeachingMode: afterScene.subjectTeachingMode,
        voiceCue: {
          castId: teacherCastId,
          emotion: 'calm',
          pace: 'medium',
          pauseRule: '任务卡讲完停 700ms,再进入量规说明。',
        },
        gradeTone: '布置清楚任务边界,评价维度具体可观察,不评价最终答案对不对。',
        teacherScript: '这一页是一个用 AI 完成的小任务。这里要讲清楚任务与量规:任务卡说明要做什么,量规说明会怎么评价——评的是你怎么和 AI 协作、怎么验证它的回答,不是最终答案本身对不对。请对照量规自己检查一遍提示词和验证过程。',
        studentAction: '按任务卡要求用 AI 完成任务,再对照量规自评提示词质量与验证过程。',
        evidenceOnScreen: ['任务卡', '评价量规'],
      }
    default:
      throw new Error(`insertSceneAfter: buildPlaceholderScene 还没有「${sceneType}」的占位幕分支。`)
  }
}
