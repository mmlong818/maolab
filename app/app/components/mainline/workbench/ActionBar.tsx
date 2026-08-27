'use client'

/**
 * ActionBar · 中栏幕级/片段级操作条(v5 M1 WP2,v5 M2 WP8 增补 executor 切换 + 插页)
 *
 * 幕级:改讲稿(切到 SceneEditForm)/ 重生成(regen)/ 删页(delete)/ 插页(insert)/
 * 人机分工切换(executor)。片段级:换骨架(reskeleton,按新认知类型重新展开该
 * 片段的幕序列)。重生成/删页/换骨架均为二次确认(delete/reskeleton 结构性破坏,
 * regen 会覆盖老师已手改的内容——三者都用 window.confirm,不引入新弹窗组件);
 * 插页是纯新增、可再删除撤销,不做二次确认。executor 切换是即时生效的教学决策
 * (走逐页 PATCH 白名单),同样不需要二次确认。
 */
import { useState, type CSSProperties } from 'react'
import type { KnowledgeType } from '@maolab/shared-types'
import { FilePenLine, PenLine, RefreshCw, ShieldCheck } from 'lucide-react'
import { sceneExecutor, type Executor, type LearningFragment, type LessonScene, type SceneType } from '@/lib/mainline'
import type { WorkbenchBusy } from './useWorkbenchActions'
import { EXECUTOR_LABEL, EXECUTOR_OPTIONS, INSERTABLE_SCENE_TYPE_OPTIONS, KNOWLEDGE_TYPE_LABEL, KNOWLEDGE_TYPE_OPTIONS, SCENE_TYPE_LABEL } from './labels'

interface ActionBarProps {
  scene: LessonScene
  fragment: LearningFragment | undefined
  editing: boolean
  busy: WorkbenchBusy
  factAuditPending: boolean
  onToggleEdit: () => void
  onRegen: () => void
  onAuditFacts: () => void
  onRedrawImage: () => void
  onOpenCowart: () => void
  onDelete: () => void
  onReskeleton: (knowledgeType: KnowledgeType) => void
  onChangeExecutor: (executor: Executor) => void
  onInsertScene: (sceneType: SceneType) => void
}

export function ActionBar({
  scene, fragment, editing, busy, factAuditPending,
  onToggleEdit, onRegen, onAuditFacts, onRedrawImage, onOpenCowart, onDelete, onReskeleton, onChangeExecutor, onInsertScene,
}: ActionBarProps) {
  const [reskeletonOpen, setReskeletonOpen] = useState(false)
  const [knowledgeType, setKnowledgeType] = useState<KnowledgeType>('conceptual')
  const [insertOpen, setInsertOpen] = useState(false)
  const [insertSceneType, setInsertSceneType] = useState<SceneType>(INSERTABLE_SCENE_TYPE_OPTIONS[0]!)

  const isStructural = scene.sceneType === 'source-reading' || scene.sceneType === 'recap'
  const isLastInFragment = Boolean(fragment && fragment.sceneIds.length <= 1)
  const deleteDisabledReason = isStructural
    ? scene.sceneType === 'source-reading'
      ? '开场幕是全课唯一入口,不能删除。'
      : '收束幕是全课唯一收束,不能删除。'
    : isLastInFragment
      ? '这是本片段最后一幕,删除后片段会没有场景;请改用换骨架。'
      : undefined
  // 与 lib/mainline/edit/scene-insert.ts 的结构约束对齐:不能插在收束幕之后(它必须保持最后一幕)。
  const insertDisabledReason = scene.sceneType === 'recap'
    ? '收束幕是全课最后一幕,不能在它之后插入新幕。'
    : undefined

  const patchingThisScene = busy !== null && busy.kind === 'patch' && busy.sceneId === scene.id
  const regeneratingThisScene = busy !== null && busy.kind === 'regen' && busy.sceneId === scene.id
  const auditingThisScene = busy !== null && busy.kind === 'fact-audit' && busy.sceneId === scene.id
  const redrawingThisImage = busy !== null && busy.kind === 'image-redraw' && busy.sceneId === scene.id
  const deletingThisScene = busy !== null && busy.kind === 'delete' && busy.sceneId === scene.id
  const insertingAfterThisScene = busy !== null && busy.kind === 'insert' && busy.sceneId === scene.id
  const reskeletoningThisFragment = busy !== null && busy.kind === 'reskeleton' && Boolean(fragment) && busy.fragmentId === fragment!.id
  const anyBusy = busy !== null

  function confirmRegen() {
    const warn = scene.editedByTeacher
      ? '这一幕老师已经手改过内容,重生成会用 AI 新写的内容覆盖手改结果,确定继续吗?'
      : '教研组将重新写这一幕的全部内容,确定继续吗?'
    if (window.confirm(warn)) onRegen()
  }

  function confirmDelete() {
    if (window.confirm('删除后这一幕不可恢复,确定删除吗?')) onDelete()
  }

  function confirmRedrawImage() {
    if (window.confirm('重绘会直接替换这一幕当前的图片，确定继续吗?')) onRedrawImage()
  }

  function confirmReskeleton() {
    if (!fragment) return
    if (window.confirm(`换骨架会清空本片段现有的幕,重新按「${KNOWLEDGE_TYPE_LABEL[knowledgeType]}」类型展开——新幕是空槽草稿,需要逐一重生成才有内容,确定继续吗?`)) {
      onReskeleton(knowledgeType)
      setReskeletonOpen(false)
    }
  }

  function confirmInsert() {
    onInsertScene(insertSceneType)
    setInsertOpen(false)
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 }}>
      <button type="button" onClick={onToggleEdit} disabled={anyBusy} style={buttonStyle(editing)}>
        <FilePenLine size={15} aria-hidden="true" style={{ marginRight: 6, verticalAlign: -2 }} />
        {editing ? '收起修正' : '修正内容'}
      </button>
      <button type="button" onClick={confirmRegen} disabled={anyBusy} style={buttonStyle(false)} title="教研组重新写这一幕的全部内容">
        {regeneratingThisScene ? '教研组正在重写这一幕…' : '重生成'}
      </button>
      {factAuditPending ? (
        <button
          type="button"
          onClick={onAuditFacts}
          disabled={anyBusy}
          style={buttonStyle(false)}
          title="保留老师的修改，只重新核查本页事实"
        >
          <ShieldCheck size={15} aria-hidden="true" style={{ marginRight: 6, verticalAlign: -2 }} />
          {auditingThisScene ? '正在核查本页…' : '核查本页'}
        </button>
      ) : null}
      {scene.imageUrl ? (
        <>
          <button
            type="button"
            onClick={confirmRedrawImage}
            disabled={anyBusy}
            style={buttonStyle(false)}
            title="保留本幕教学内容，重新生成一张配图"
          >
            <RefreshCw size={15} aria-hidden="true" style={{ marginRight: 6, verticalAlign: -2 }} />
            {redrawingThisImage ? '正在重绘图片…' : '重绘图片'}
          </button>
          <button
            type="button"
            onClick={onOpenCowart}
            disabled={anyBusy}
            style={buttonStyle(false)}
            title="在 Cowart 画布中用箭头、笔迹和文字标注后生成修改版"
          >
            <PenLine size={15} aria-hidden="true" style={{ marginRight: 6, verticalAlign: -2 }} />
            Cowart 修改
          </button>
        </>
      ) : null}
      <button
        type="button"
        onClick={confirmDelete}
        disabled={anyBusy || Boolean(deleteDisabledReason)}
        title={deleteDisabledReason}
        style={dangerButtonStyle(Boolean(deleteDisabledReason) || anyBusy)}
      >
        {deletingThisScene ? '正在删除…' : '删页'}
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {insertOpen && (
          <select
            value={insertSceneType}
            onChange={e => setInsertSceneType(e.target.value as SceneType)}
            disabled={anyBusy}
            style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13 }}
          >
            {INSERTABLE_SCENE_TYPE_OPTIONS.map(st => (
              <option key={st} value={st}>
                {SCENE_TYPE_LABEL[st]}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => (insertOpen ? confirmInsert() : setInsertOpen(true))}
          disabled={anyBusy || Boolean(insertDisabledReason)}
          title={insertDisabledReason ?? '在这一幕之后插入一幕新场景(空槽草稿,插入后需逐一填内容)'}
          style={buttonStyle(insertOpen)}
        >
          {insertingAfterThisScene ? '正在插入…' : insertOpen ? '确认插入' : '插入幕'}
        </button>
        {insertOpen && (
          <button type="button" onClick={() => setInsertOpen(false)} disabled={anyBusy} style={buttonStyle(false)}>
            取消
          </button>
        )}
      </div>

      <span style={{ width: 1, height: 20, background: '#e5e7eb', margin: '0 4px' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>执教:</span>
        {EXECUTOR_OPTIONS.map(ex => (
          <button
            key={ex}
            type="button"
            onClick={() => onChangeExecutor(ex)}
            disabled={anyBusy}
            title="调整本幕由谁执教(教师亲授/AI 演出/双师协作),教师可随时改分工"
            style={buttonStyle(sceneExecutor(scene) === ex)}
          >
            {EXECUTOR_LABEL[ex]}
          </button>
        ))}
      </div>

      <span style={{ width: 1, height: 20, background: '#e5e7eb', margin: '0 4px' }} />

      {fragment?.kpId ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {reskeletonOpen && (
            <select
              value={knowledgeType}
              onChange={e => setKnowledgeType(e.target.value as KnowledgeType)}
              disabled={anyBusy}
              style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13 }}
            >
              {KNOWLEDGE_TYPE_OPTIONS.map(kt => (
                <option key={kt} value={kt}>
                  {KNOWLEDGE_TYPE_LABEL[kt]}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => (reskeletonOpen ? confirmReskeleton() : setReskeletonOpen(true))}
            disabled={anyBusy}
            style={buttonStyle(reskeletonOpen)}
            title="按新的认知类型重新展开本片段的幕序列(片段级操作,影响本片段所有幕)"
          >
            {reskeletoningThisFragment
              ? '正在按新骨架重新搭建…'
              : reskeletonOpen
                ? '确认换骨架'
                : '换骨架(本片段)'}
          </button>
          {reskeletonOpen && (
            <button type="button" onClick={() => setReskeletonOpen(false)} disabled={anyBusy} style={buttonStyle(false)}>
              取消
            </button>
          )}
        </div>
      ) : (
        <span style={{ fontSize: 12, color: '#9ca3af' }}>课级片段(开场/收束)不支持换骨架</span>
      )}

      {patchingThisScene && <span style={{ fontSize: 12, color: '#9ca3af' }}>保存中…</span>}
    </div>
  )
}

function buttonStyle(active: boolean): CSSProperties {
  return {
    padding: '7px 14px', borderRadius: 8, border: '1px solid #d1d5db',
    background: active ? '#111827' : '#fff', color: active ? '#fff' : '#374151',
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
  }
}

function dangerButtonStyle(disabled: boolean): CSSProperties {
  return {
    padding: '7px 14px', borderRadius: 8, border: '1px solid #fca5a5',
    background: disabled ? '#fef2f2' : '#fff', color: disabled ? '#fca5a5' : '#b91c1c',
    fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
  }
}
